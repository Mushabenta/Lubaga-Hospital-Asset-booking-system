const bcrypt = require('bcryptjs');
const { pool, connectDB } = require('./db');
const env = require('./env');

// Service Element -> Departments mapping (mirrors the existing frontend).
const serviceElements = {
  'Leadership and Mgmt': ['Finance', "MD's Office", "ED's Office", "PNO's Office", 'Student Coordinators Office', 'Research', 'Internal Auditor', 'Pastoral'],
  'Human Resource': ['HR Office', 'St Kizito Day Care'],
  'Administrative Support': ["Hospital Admin's Office", 'Procurement', 'Central Store', 'Transport', 'Internal Security Office', 'Records Office'],
  'Access to Care and Patients Rights': ['Access to Care and Patients Rights'],
  'Risk Management': ['Risk Management'],
  Resuscitation: ['Resuscitation'],
  'Information Mgmt, QA & QI': ['ICT Office', 'Quality Assurance'],
  'Infection Prevention and Control': ['Infection Prevention and Control'],
  'Inpatient Care': ['Medical Care', 'Surgical Care', 'Paediatric Care', 'Obstetrics and Maternity Care', 'IPD Specialist Center', 'ICU'],
  'Ambulatory Care': ['Medical OPD', 'Specialist Center OPD', 'Public Health Dept', 'Emergency Care', 'Dialysis', 'Eye Clinic', 'Dental Clinic'],
  'Operating Theatre and Anaesthetic Care': ['General Operating Theatre', 'Transplant Theatre', 'Specialist Center Theatre'],
  Laboratory: ['Laboratory'],
  'Radiology and Diagnostic Imaging': ['Radiology and Diagnostic Imaging'],
  Pharmacy: ['Main Pharmacy', 'Maternity Pharmacy', 'IPD Pharmacy', 'OPD Pharmacy', 'PHD Pharmacy', 'Specialist Center Pharmacy'],
  'Therapeutic Support': ['Physiotherapy', 'Social Worker', 'Psychiatry', 'Others'],
  'Central Sterile Supply Dept': ['CSSD'],
  'Food Service': ['Food Service'],
  'Linen Management': ['Linen Management'],
  'House keeping': ['House keeping'],
  Maintenance: ['Plumbing', 'Electrical', 'Estates/Building', 'Carpentry', 'Waste Collection'],
  'Medical Equipment Management': ['Medical Equipment Management']
};

// Default asset categories and their default models/specifications.
// Mirrors the admin dashboard's default asset catalogue (20 categories).
const categories = [
  { name: 'Laptop', specifications: ['Dell Latitude 5420', 'HP EliteBook 840', 'Lenovo ThinkPad X1', 'MacBook Pro 14"', 'Acer Swift 3'] },
  { name: 'Desktop Computer', specifications: ['HP ProDesk 600', 'Dell OptiPlex 7080', 'Lenovo ThinkCentre', 'Apple iMac 24"'] },
  { name: 'Computer Webcam', specifications: ['Logitech C920', 'Logitech Brio 4K', 'Microsoft LifeCam HD', 'Razer Kiyo'] },
  { name: 'Computer Speakers', specifications: ['Logitech Z207', 'Bose Companion 2', 'Creative Pebble', 'JBL Pebbles'] },
  { name: 'External Hard Drive', specifications: ['WD 1TB', 'Seagate 2TB', 'Samsung T5 SSD', 'Sandisk Extreme SSD'] },
  { name: 'Printer', specifications: ['HP LaserJet M404', 'Canon Pixma G7020', 'Brother HL-L2350', 'Epson EcoTank'] },
  { name: 'Scanner', specifications: ['Fujitsu ScanSnap iX1600', 'Brother ADS-1700W', 'Canon CanoScan LiDE', 'Epson Workforce ES-500W'] },
  { name: 'Monitor', specifications: ['Dell 24" LED', 'HP 27" FHD', 'LG 27" 4K', 'Samsung 24" Curved'] },
  { name: 'Tablet', specifications: ['Samsung Galaxy Tab S7', 'iPad Pro 12.9"', 'Lenovo Tab P11', 'Microsoft Surface Go'] },
  { name: 'Keyboard', specifications: ['Logitech MX Keys', 'Dell Wireless Keyboard', 'HP Wireless Keyboard', 'Apple Magic Keyboard'] },
  { name: 'Mouse', specifications: ['Logitech MX Master 3', 'Dell Wireless Mouse', 'HP Wireless Mouse', 'Apple Magic Mouse'] },
  { name: 'Projector', specifications: ['Epson EB-2150W', 'BenQ MH550', 'Sony VPL-FHZ80', 'NEC NP-P502HL', 'Optoma EH461'] },
  { name: 'Public Address Speaker', specifications: ['Bose F1 Model 812', 'JBL PRX815W', 'Yamaha DZR15', 'QSC K12.2'] },
  { name: 'TV', specifications: ['Samsung 55" Smart TV', 'LG 65" OLED', 'Sony 50" 4K', 'TCL 43" Roku TV'] },
  { name: 'Sound System', specifications: ['Bose L1 Pro', 'JBL EON One', 'Yamaha Stagepas 1K', 'Harbinger MLS900'] },
  { name: 'Microphone', specifications: ['Shure SM58', 'Sennheiser E835', 'AKG D5', 'Audio-Technica AT2020'] },
  { name: 'Video Camera', specifications: ['Sony PXW-Z190', 'Canon XA55', 'Panasonic AG-UX180', 'JVC GY-HC500'] },
  { name: 'Projector Screen', specifications: ['Elite Screens 120"', 'Da-Lite 100"', 'Draper 90"', 'Stewart 110"'] },
  { name: 'Conference Speaker', specifications: ['Bose Videobar VB1', 'Jabra PanaCast 50', 'Poly Studio USB', 'Logitech Rally Bar'] },
  { name: 'Wireless Microphone', specifications: ['Shure QLXD', 'Sennheiser EW100 G4', 'AKG DMS800', 'Beyerdynamic TG 100'] }
];

async function seed() {
  await connectDB();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Admin user (idempotent).
    const adminExists = await client.query('SELECT 1 FROM users WHERE username = $1', [env.admin.username]);
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash(env.admin.password, 10);
      await client.query(
        `INSERT INTO users (username, email, phone, password_hash, role, service_element, department)
         VALUES ($1,$2,$3,$4,'general_admin',$5,$6)`,
        [env.admin.username, env.admin.email, env.admin.phone, hash, 'Administrative Support', "Hospital Admin's Office"]
      );
      console.log('Admin user created:', env.admin.username);
    } else {
      console.log('Admin user already exists, skipping.');
    }

    // Departments.
    for (const [element, depts] of Object.entries(serviceElements)) {
      for (const dept of depts) {
        await client.query(
          'INSERT INTO departments (name, service_element) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING',
          [dept, element]
        );
      }
    }
    console.log('Departments seeded.');

    // Categories + default assets.
    for (const cat of categories) {
      const catRes = await client.query(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id',
        [cat.name]
      );
      const categoryId = catRes.rows[0]
        ? catRes.rows[0].id
        : (await client.query('SELECT id FROM categories WHERE name = $1', [cat.name])).rows[0].id;

      for (let i = 0; i < cat.specifications.length; i++) {
        const spec = cat.specifications[i];
        const code = `${cat.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${100 + i}`;
        const assetRes = await client.query(
          'INSERT INTO assets (name, code, category_id, description, status)' +
          " VALUES ($1,$2,$3,'','available') ON CONFLICT (code) DO NOTHING RETURNING id",
          [spec, code, categoryId]
        );
        if (assetRes.rows[0]) {
          await client.query(
            'INSERT INTO asset_specifications (asset_id, specification) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [assetRes.rows[0].id, spec]
          );
        }
      }
    }
    console.log('Categories and default assets seeded.');

    await client.query('COMMIT');
    console.log('Seeding completed successfully.');
    console.log('Admin login:', env.admin.username, '/', env.admin.password);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err.message);
      process.exit(1);
    });
}

module.exports = seed;
