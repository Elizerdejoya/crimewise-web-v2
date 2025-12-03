const db = require("./db");

async function migrateKeywordPools() {
  try {
    console.log("Starting keyword pools migration...");

    // Check if keyword_pools table exists, if not create it
    const keywordPoolsExists = await db.sql`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='keyword_pools'
    `;

    if (keywordPoolsExists.length === 0) {
      console.log("Creating keyword_pools table...");
      await db.sql`CREATE TABLE keyword_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        keywords TEXT NOT NULL, -- JSON array of keywords
        description TEXT,
        organization_id INTEGER,
        created_by INTEGER,
        created TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(organization_id) REFERENCES organizations(id),
        FOREIGN KEY(created_by) REFERENCES users(id)
      )`;
      console.log("✅ keyword_pools table created");
    } else {
      console.log("✅ keyword_pools table already exists");
    }

    // Check if questions table has keyword_pool_id column
    const questionsSchema = await db.sql`PRAGMA table_info(questions)`;
    const hasKeywordPoolId = questionsSchema.some(col => col.name === 'keyword_pool_id');
    const hasSelectedKeywords = questionsSchema.some(col => col.name === 'selected_keywords');

    if (!hasKeywordPoolId) {
      console.log("Adding keyword_pool_id column to questions table...");
      await db.sql`ALTER TABLE questions ADD COLUMN keyword_pool_id INTEGER`;
      console.log("✅ keyword_pool_id column added");
    } else {
      console.log("✅ keyword_pool_id column already exists");
    }

    if (!hasSelectedKeywords) {
      console.log("Adding selected_keywords column to questions table...");
      await db.sql`ALTER TABLE questions ADD COLUMN selected_keywords TEXT`;
      console.log("✅ selected_keywords column added");
    } else {
      console.log("✅ selected_keywords column already exists");
    }

    // Add foreign key constraint for keyword_pool_id if it doesn't exist
    try {
      await db.sql`
        CREATE INDEX IF NOT EXISTS idx_questions_keyword_pool_id 
        ON questions(keyword_pool_id)
      `;
      console.log("✅ Index created for keyword_pool_id");
    } catch (err) {
      console.log("Index may already exist:", err.message);
    }

    // Insert default keyword pools if they don't exist
    const existingPools = await db.sql`SELECT COUNT(*) as count FROM keyword_pools`;
    
    if (existingPools[0].count === 0) {
      console.log("Inserting default keyword pools...");
      
      await db.sql`INSERT INTO keyword_pools (id, name, keywords, description, organization_id, created_by) VALUES
        (1, 'Forensic Science Keywords', ${JSON.stringify([
          'DNA', 'fingerprint', 'blood', 'fiber', 'hair', 'pollen', 'soil', 'glass', 
          'paint', 'toolmark', 'ballistics', 'toxicology', 'pathology', 'anthropology',
          'entomology', 'botany', 'psychology', 'chemistry', 'physics', 'biology'
        ])}, 'Common keywords used in forensic science analysis', 1, 1),
        (2, 'Criminal Law Terms', ${JSON.stringify([
          'felony', 'misdemeanor', 'motive', 'intent', 'mens rea', 'actus reus',
          'burden of proof', 'reasonable doubt', 'evidence', 'testimony', 'witness',
          'prosecution', 'defense', 'jury', 'verdict', 'sentencing', 'appeal'
        ])}, 'Key terms in criminal law and procedure', 1, 1),
        (3, 'Evidence Types', ${JSON.stringify([
          'physical evidence', 'documentary evidence', 'testimonial evidence', 
          'circumstantial evidence', 'direct evidence', 'real evidence', 'demonstrative evidence',
          'expert evidence', 'hearsay evidence', 'admissible evidence', 'inadmissible evidence'
        ])}, 'Different types of evidence in legal proceedings', 1, 1),
        (4, 'Crime Scene Analysis', ${JSON.stringify([
          'crime scene', 'investigation', 'documentation', 'photography', 'sketching',
          'evidence collection', 'chain of custody', 'contamination', 'preservation',
          'reconstruction', 'timeline', 'modus operandi', 'signature', 'ritual'
        ])}, 'Keywords related to crime scene investigation and analysis', 1, 1)
      `;
      console.log("✅ Default keyword pools inserted");
    } else {
      console.log("✅ Keyword pools already exist");
    }

    console.log("🎉 Keyword pools migration completed successfully!");
    
  } catch (err) {
    console.error("❌ Migration failed:", err);
    throw err;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateKeywordPools()
    .then(() => {
      console.log("Migration completed successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = migrateKeywordPools;
