const EmailService = require('../services/emailService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../middleware/error');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailController = {
  status: asyncHandler(async (req, res) => {
    success(res, { email: EmailService.getConfigStatus() });
  }),

  test: asyncHandler(async (req, res) => {
    const to = req.body ? String(req.body.to || '').trim() : '';
    if (to && !EMAIL_RE.test(to)) {
      throw new ApiError(400, 'Invalid email address', 'INVALID_EMAIL');
    }

    const report = await EmailService.runDiagnostic(to || undefined);
    if (report.send !== 'ok') {
      throw new ApiError(502, 'Email test failed', 'EMAIL_TEST_FAILED', report);
    }
    success(res, report, 'Test email sent successfully');
  })
};

module.exports = EmailController;