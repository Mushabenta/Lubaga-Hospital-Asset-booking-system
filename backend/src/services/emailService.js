const nodemailer = require('nodemailer');
const env = require('../config/env');
const User = require('../models/User');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, user, pass } = env.email;
  if (!user || !pass) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not set – emails will be skipped');
    return null;
  }
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

async function send(to, subject, html) {
  const transport = getTransporter();
  if (!transport) {
    console.warn('[email] Skipping email to', to, '– EMAIL_USER/EMAIL_PASS not configured');
    return false;
  }
  try {
    await transport.sendMail({
      from: env.email.from,
      to,
      subject,
      html
    });
    console.log('[email] Sent to', to);
    return true;
  } catch (err) {
    console.error('[email] Failed to send to', to, err.message);
    return false;
  }
}

function bookingDetailsTable(booking) {
  const start = booking.start_time ? new Date(booking.start_time).toLocaleString() : 'N/A';
  const end = booking.end_time ? new Date(booking.end_time).toLocaleString() : 'N/A';
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:8px;font-weight:600;color:#555;">Asset</td><td style="padding:8px;">${booking.asset_name || booking.category || 'N/A'}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:600;color:#555;">Category</td><td style="padding:8px;">${booking.category || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:600;color:#555;">Requested By</td><td style="padding:8px;">${booking.requestor || 'N/A'}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:600;color:#555;">Email</td><td style="padding:8px;">${booking.email || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:600;color:#555;">Phone</td><td style="padding:8px;">${booking.phone || 'N/A'}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:600;color:#555;">Department</td><td style="padding:8px;">${booking.user_department || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:600;color:#555;">Booking Start</td><td style="padding:8px;">${start}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:600;color:#555;">Booking End</td><td style="padding:8px;">${end}</td></tr>
      <tr><td style="padding:8px;font-weight:600;color:#555;">Reason</td><td style="padding:8px;">${booking.purpose || 'No reason provided'}</td></tr>
    </table>`;
}

const EmailService = {
  async notifyAdminsNewBooking(booking) {
    const admins = await User.findAdmins();
    console.log('[email] notifyAdminsNewBooking: admins found =', admins.length,
      admins.map(a => a.email).join(', ') || '(none)');
    if (!admins.length) {
      console.warn('[email] No admin users found – skipping new booking notification');
      return;
    }

    const asset = booking.asset_name || booking.category || 'Unknown Asset';
    const subject = `New Asset Booking Request - ${asset}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#fd7e14;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">New Booking Request</h2>
        </div>
        <div style="padding:20px 24px;background:#fff;border:1px solid #e9ecef;">
          <p style="font-size:15px;color:#333;">A new asset booking request has been submitted and requires your review.</p>
          ${bookingDetailsTable(booking)}
          <div style="text-align:center;margin:24px 0;">
            <a href="${env.corsOrigin[0] || 'http://localhost:5000'}/admin-dashboard.html"
               style="background:#0a58ca;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">
               Review Request
            </a>
          </div>
        </div>
        <div style="padding:12px 24px;background:#f8f9fa;text-align:center;font-size:12px;color:#888;border-radius:0 0 8px 8px;">
          Lubaga Hospital Asset Booking System
        </div>
      </div>`;

    const results = await Promise.allSettled(
      admins.map(a => send(a.email, subject, html))
    );
    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[email] New booking notification sent to ${sent}/${admins.length} admins`);
  },

  async notifyUserBookingStatus(booking, status, adminName) {
    console.log(`[email] notifyUserBookingStatus: status=${status}, to=${booking.email}, from_admin=${adminName}`);
    if (!booking.email) {
      console.warn('[email] No user email – skipping status notification');
      return false;
    }

    const asset = booking.asset_name || booking.category || 'Unknown Asset';
    let subject, headerColor, headerText, message;

    if (status === 'approved') {
      subject = `Booking Approved - ${asset}`;
      headerColor = '#28a745';
      headerText = 'Booking Approved';
      message = `Your booking request for <strong>${asset}</strong> has been <span style="color:#28a745;font-weight:700;">approved</span> by ${adminName || 'an administrator'}. You may now collect the asset.`;
    } else if (status === 'rejected') {
      subject = `Booking Rejected - ${asset}`;
      headerColor = '#dc3545';
      headerText = 'Booking Rejected';
      message = `We regret to inform you that your booking request for <strong>${asset}</strong> has been <span style="color:#dc3545;font-weight:700;">rejected</span> by ${adminName || 'an administrator'}.`;
    } else if (status === 'given_out') {
      subject = `Asset Given Out - ${asset}`;
      headerColor = '#0d6efd';
      headerText = 'Asset Given Out';
      message = `The asset <strong>${asset}</strong> has been given out to you. Please return it within <strong>3 days</strong>.`;
    } else if (status === 'returned') {
      subject = `Asset Returned - ${asset}`;
      headerColor = '#17a2b8';
      headerText = 'Asset Returned';
      message = `The asset <strong>${asset}</strong> has been marked as returned. Thank you for using our service.`;
    } else {
      return false;
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:${headerColor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">${headerText}</h2>
        </div>
        <div style="padding:20px 24px;background:#fff;border:1px solid #e9ecef;">
          <p style="font-size:15px;color:#333;">${message}</p>
          ${bookingDetailsTable(booking)}
        </div>
        <div style="padding:12px 24px;background:#f8f9fa;text-align:center;font-size:12px;color:#888;border-radius:0 0 8px 8px;">
          Lubaga Hospital Asset Booking System
        </div>
      </div>`;

    return send(booking.email, subject, html);
  }
};

module.exports = EmailService;
