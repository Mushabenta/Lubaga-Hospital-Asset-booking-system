const { pool } = require('./src/config/db');
const User = require('./src/models/User');
const Booking = require('./src/models/Booking');
const EmailService = require('./src/services/emailService');

async function debug() {
  console.log('=== 1. CONNECTION ===');
  try {
    const c = await pool.connect();
    console.log('DB connected OK');
    c.release();
  } catch (e) {
    console.error('DB connection FAILED:', e.message);
    process.exit(1);
  }

  console.log('=== 2. USERS ===');
  const users = await User.findAll();
  console.log('Total users:', users.length);
  users.forEach(u => console.log(`  id=${u.id} username=${u.username} role=${u.role} email="${u.email}" active=${u.active}`));

  console.log('=== 3. ADMIN EMAIL RECIPIENTS ===');
  const admins = await User.findAdmins();
  console.log(`findAdmins() returned ${admins.length} (role admin/general_admin, active, non-empty email)`);
  admins.forEach(a => console.log(`  -> sends to ${a.email}`));

  console.log('=== 4. RECENT BOOKINGS (email availability) ===');
  const { bookings } = await Booking.findAll({ role: 'admin', limit: 5 });
  console.log('Recent bookings:', bookings.length);
  for (const b of bookings) {
    console.log(`  #${b.id} status=${b.status} asset=${b.asset_name} requestor=${b.requestor} email="${b.email}" phone="${b.phone}"`);
  }
  const pending = bookings.find(b => b.status === 'pending');

  console.log('=== 5. EMAIL SEND TESTS ===');
  if (admins.length === 0) {
    console.log('WARN: No admins found - notifyAdminsNewBooking will skip silently!');
  }

  const realBooking = pending || bookings[0];
  if (realBooking) {
    console.log(`Calling notifyAdminsNewBooking with REAL booking #${realBooking.id}...`);
    await EmailService.notifyAdminsNewBooking(realBooking);
    console.log('notifyAdminsNewBooking done');
    if (realBooking.email) {
      console.log(`Calling notifyUserBookingStatus(${realBooking.status === 'pending' ? 'approved' : realBooking.status}) to ${realBooking.email}...`);
      await EmailService.notifyUserBookingStatus(realBooking, realBooking.status === 'pending' ? 'approved' : realBooking.status, 'debug-script');
      console.log('notifyUserBookingStatus done');
    } else {
      console.log('WARN: booking has no user email - notifyUserBookingStatus will skip silently');
    }
  } else {
    console.log('WARN: No bookings in DB - cannot test with real booking');
  }

  console.log('=== 6. DONE ===');
  await pool.end();
  process.exit(0);
}

debug().catch(e => { console.error('UNHANDLED:', e); process.exit(1); });