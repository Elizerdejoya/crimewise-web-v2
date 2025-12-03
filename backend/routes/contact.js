const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();

// Create transporter for sending emails
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.CONTACT_EMAIL,
      pass: process.env.CONTACT_EMAIL_PASSWORD
    }
  });
};

// POST /api/contact - Send contact form email
router.post("/contact", async (req, res) => {
  try {
    console.log("Contact form received:", req.body);
    const { name, email, message, institution } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        error: "All fields are required"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Please provide a valid email address"
      });
    }

    // Set response timeout to prevent hanging
    res.setTimeout(30000, () => {
      if (!res.headersSent) {
        console.error("Contact form request timeout");
        res.status(408).json({
          error: "Request timeout. Please try again."
        });
      }
    });

    // Create transporter
    const transporter = createTransporter();

    // Email content
    const mailOptions = {
      from: process.env.CONTACT_EMAIL,
      to: process.env.CONTACT_EMAIL, // Send to the same email for now
      subject: `New Contact Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Contact Details</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${institution ? `<p><strong>Institution/Organization:</strong> ${institution}</p>` : ''}
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px;">
            <h3 style="color: #495057; margin-top: 0;">Message</h3>
            <p style="line-height: 1.6; color: #495057;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 14px;">
            <p>This message was sent from the CrimeWise contact form.</p>
            <p>Reply directly to this email to respond to the sender.</p>
          </div>
        </div>
      `,
      replyTo: email // Set reply-to header to the sender's email
    };

    console.log("Sending main email...");
    // Send main email with timeout
    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout')), 25000)
      )
    ]);

    console.log("Main email sent successfully");

    // Send auto-reply to the sender (don't let this failure affect the main response)
    // Use Promise.race to prevent auto-reply from blocking the response
    const autoReplyPromise = (async () => {
      try {
        const autoReplyOptions = {
          from: process.env.CONTACT_EMAIL,
          to: email,
          subject: "Thank you for contacting CrimeWise",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">
                Thank You for Contacting CrimeWise
              </h2>
              
              <p style="font-size: 16px; line-height: 1.6; color: #495057;">
                Dear ${name},
              </p>
              
              <p style="font-size: 16px; line-height: 1.6; color: #495057;">
                Thank you for reaching out to us! We have received your message and our team will review it shortly.
              </p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #495057; margin-top: 0;">Your Message</h3>
                <p style="line-height: 1.6; color: #495057; font-style: italic;">${message.replace(/\n/g, '<br>')}</p>
              </div>
              
              <p style="font-size: 16px; line-height: 1.6; color: #495057;">
                We typically respond within 24 hours during business days. If you have any urgent inquiries, 
                please don't hesitate to contact us directly.
              </p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
                <p style="color: #6c757d; font-size: 14px;">
                  Best regards,<br>
                  <strong>The CrimeWise Team</strong>
                </p>
                <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
                  This is an automated response. Please do not reply to this email.
                </p>
              </div>
            </div>
          `
        };

        await transporter.sendMail(autoReplyOptions);
        console.log("Auto-reply email sent successfully");
      } catch (autoReplyError) {
        console.error("Auto-reply email failed:", autoReplyError);
        // Don't throw the error - the main email was sent successfully
      }
    })();

    // Don't await the auto-reply, let it run in background
    autoReplyPromise.catch(() => {
      // Silently handle auto-reply errors
    });

    console.log("Sending success response immediately");
    // Send success response immediately after main email is sent
    res.json({
      success: true,
      message: "Your message has been sent successfully! We'll get back to you soon."
    });

  } catch (error) {
    console.error("Contact form error:", error);
    
    // Check if response has already been sent
    if (res.headersSent) {
      console.error("Response already sent, cannot send error response");
      return;
    }
    
    res.status(500).json({
      error: "Failed to send message. Please try again later."
    });
  }
});

module.exports = router;
