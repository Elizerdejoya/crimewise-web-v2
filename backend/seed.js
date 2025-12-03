const db = require("./db");

async function seed() {
  try {
    console.log("Seeding database with sample data...");

    // --- ORGANIZATIONS --- (must be first due to foreign key constraints)
    await db.sql`INSERT OR IGNORE INTO organizations (id, name, domain, contact_email, subscription_plan, max_users, max_storage_gb) VALUES
      (1, 'CrimeWise Main', 'crimewise.com', 'admin@crimewise.com', 'premium', 200, 50),
      (2, 'Police Academy A', 'policeacademy-a.edu', 'admin@policeacademy-a.edu', 'basic', 50, 10),
      (3, 'Criminal Justice Institute', 'cji.org', 'admin@cji.org', 'enterprise', 500, 100)
    `;

    // --- BATCHES ---
    await db.sql`INSERT OR IGNORE INTO batches (id, name, organization_id) VALUES (1, 'Batch A', 1), (2, 'Batch B', 1)`;

    // --- CLASSES ---
    await db.sql`INSERT OR IGNORE INTO classes (id, name, batch_id, organization_id) VALUES (1, 'Class 1', 1, 1), (2, 'Class 2', 2, 1)`;

    // --- COURSES ---
    await db.sql`INSERT OR IGNORE INTO courses (id, name, code, description, organization_id) VALUES (1, 'Criminal Law', 'CRIM101', 'Intro to Criminal Law', 1), (2, 'Forensics', 'FORE201', 'Forensic Science Basics', 1)`;

    // --- USERS ---
    await db.sql`INSERT OR IGNORE INTO users (id, email, password, role, name, organization_id, class_id) VALUES
      (1, 'superadmin@crimewise.com', 'superpass', 'super_admin', 'Super Admin', NULL, NULL),
      (2, 'admin@crimewise.com', 'adminpass', 'admin', 'Admin User', 1, NULL),
      (3, 'instructor1@crimewise.com', 'instrpass', 'instructor', 'Instructor One', 1, NULL),
      (4, 'student1@crimewise.com', 'studpass', 'student', 'Student One', 1, 1),
      (5, 'student2@crimewise.com', 'studpass', 'student', 'Student Two', 1, 2),
      (6, 'admin@policeacademy-a.edu', 'adminpass', 'admin', 'Police Academy Admin', 2, NULL),
      (7, 'admin@cji.org', 'adminpass', 'admin', 'CJI Admin', 3, NULL)
    `;

    // --- CLASS_INSTRUCTOR ---
    await db.sql`INSERT OR IGNORE INTO class_instructor (id, class_id, instructor_id) VALUES (1, 1, 2), (2, 2, 2)`;

    // --- BATCH_COURSE ---
    await db.sql`INSERT OR IGNORE INTO batch_course (id, batch_id, course_id) VALUES (1, 1, 1), (2, 2, 2)`;

    // --- INSTRUCTOR_COURSE ---
    await db.sql`INSERT OR IGNORE INTO instructor_course (id, instructor_id, course_id) VALUES (1, 2, 1), (2, 2, 2)`;

    // --- QUESTIONS ---
    await db.sql`INSERT OR IGNORE INTO questions (id, title, text, course_id, difficulty, type, answer, points, created_by, organization_id) VALUES
      (1, 'What is a felony?', 'Define felony in criminal law.', 1, 'easy', 'short', 'A felony is a serious crime.', 5, 3, 1),
      (2, 'Evidence types', 'List two types of forensic evidence.', 2, 'medium', 'short', 'Physical, Biological', 5, 3, 1)
    `;

    // --- EXAMS ---
    await db.sql`INSERT OR IGNORE INTO exams (id, name, course_id, class_id, instructor_id, question_id, start, end, duration, token) VALUES
      (1, 'Criminal Law Midterm', 1, 1, 2, 1, '2024-06-01T09:00', '2024-06-01T10:00', '60', 'TOKEN123'),
      (2, 'Forensics Quiz', 2, 2, 2, 2, '2024-06-02T09:00', '2024-06-02T09:30', '30', 'TOKEN456')
    `;

    // --- RESULTS ---
    await db.sql`INSERT OR IGNORE INTO results (id, student_id, exam_id, score, date, answer, tab_switches, details, explanation) VALUES
      (1, 3, 1, 90, '2024-06-01', 'A felony is a serious crime.', 0, 'Good answer', 'Well explained'),
      (2, 4, 2, 80, '2024-06-02', 'Physical, Biological', 1, 'Missed one point', 'Needs more detail')
    `;

    // --- RELATIONS (if needed) ---
    await db.sql`INSERT OR IGNORE INTO relations (id, type, class_id, instructor_id, batch_id, course_id) VALUES
      (1, 'class_instructor', 1, 2, NULL, NULL),
      (2, 'batch_course', NULL, NULL, 1, 1)
    `;

    // --- KEYWORD POOLS ---
    await db.sql`INSERT OR IGNORE INTO keyword_pools (id, name, keywords, description, organization_id, created_by) VALUES
      (1, 'Forensic Science Keywords', '${JSON.stringify([
        'DNA', 'fingerprint', 'blood', 'fiber', 'hair', 'pollen', 'soil', 'glass', 
        'paint', 'toolmark', 'ballistics', 'toxicology', 'pathology', 'anthropology',
        'entomology', 'botany', 'psychology', 'chemistry', 'physics', 'biology'
      ])}', 'Common keywords used in forensic science analysis', 1, 2),
      (2, 'Criminal Law Terms', '${JSON.stringify([
        'felony', 'misdemeanor', 'motive', 'intent', 'mens rea', 'actus reus',
        'burden of proof', 'reasonable doubt', 'evidence', 'testimony', 'witness',
        'prosecution', 'defense', 'jury', 'verdict', 'sentencing', 'appeal'
      ])}', 'Key terms in criminal law and procedure', 1, 2),
      (3, 'Evidence Types', '${JSON.stringify([
        'physical evidence', 'documentary evidence', 'testimonial evidence', 
        'circumstantial evidence', 'direct evidence', 'real evidence', 'demonstrative evidence',
        'expert evidence', 'hearsay evidence', 'admissible evidence', 'inadmissible evidence'
      ])}', 'Different types of evidence in legal proceedings', 1, 2),
      (4, 'Crime Scene Analysis', '${JSON.stringify([
        'crime scene', 'investigation', 'documentation', 'photography', 'sketching',
        'evidence collection', 'chain of custody', 'contamination', 'preservation',
        'reconstruction', 'timeline', 'modus operandi', 'signature', 'ritual'
      ])}', 'Keywords related to crime scene investigation and analysis', 1, 2)
    `;

    console.log("Database seeded successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err.message);
    process.exit(1);
  }
}

seed();
