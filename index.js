// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Send support tickets to email
 * This triggers whenever a new document is added to support_tickets collection
 */
exports.sendSupportEmail = functions.firestore
  .document('support_tickets/{ticketId}')
  .onCreate(async (snapshot, context) => {
    const ticket = snapshot.data();
    const ticketId = context.params.ticketId;

    // Get the email from ticket or use default
    const toEmail = 'earnspherenigeria@gmail.com';
    const userEmail = ticket.user_email || 'Anonymous';
    const issueType = ticket.issue_type || 'Not specified';
    const message = ticket.message || 'No message provided';
    const timestamp = ticket.timestamp ? ticket.timestamp.toDate() : new Date();

    // Create a beautiful HTML email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #0f172a; color: #f1f5f9; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 24px; }
          .header { text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; }
          .header h1 { color: #3b82f6; font-size: 24px; }
          .header p { color: #94a3b8; font-size: 14px; }
          .field { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1e293b; }
          .field-label { color: #94a3b8; }
          .field-value { color: #f1f5f9; font-weight: 600; }
          .message-box { background: #0f172a; padding: 16px; border-radius: 8px; margin: 16px 0; }
          .message-box p { color: #cbd5e1; line-height: 1.6; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #334155; color: #64748b; font-size: 12px; }
          .badge { display: inline-block; background: #3b82f6; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 New Support Ticket</h1>
            <p><span class="badge">#${ticketId.slice(0,8)}</span></p>
          </div>
          
          <div style="padding: 16px 0;">
            <div class="field">
              <span class="field-label">👤 User</span>
              <span class="field-value">${userEmail}</span>
            </div>
            <div class="field">
              <span class="field-label">📋 Issue Type</span>
              <span class="field-value">${issueType}</span>
            </div>
            <div class="field">
              <span class="field-label">📅 Time</span>
              <span class="field-value">${timestamp.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</span>
            </div>
          </div>
          
          <div class="message-box">
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">💬 Message</p>
            <p style="color: #f1f5f9; font-size: 16px; line-height: 1.6;">${message}</p>
          </div>
          
          <div style="text-align: center; padding: 16px 0; border-top: 1px solid #334155; color: #64748b; font-size: 14px;">
            <p>Reply directly to this email to respond to the user.</p>
          </div>
          
          <div class="footer">
            <p>© 2026 EarnSphere Hub Limited</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Plain text version for email clients that don't support HTML
    const plainText = `
      NEW SUPPORT TICKET
      -----------------
      Ticket: #${ticketId.slice(0,8)}
      User: ${userEmail}
      Issue: ${issueType}
      Time: ${timestamp.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}
      
      Message:
      ${message}
      
      -----------------
      Reply to this email to respond.
    `;

    try {
      // Add to mail collection (will be sent by Firebase Trigger Email extension)
      await admin.firestore().collection('mail').add({
        to: toEmail,
        message: {
          subject: `🔔 New Support Ticket: ${issueType}`,
          html: emailHtml,
          text: plainText
        }
      });

      // Update ticket status
      await snapshot.ref.update({
        notified: true,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Email queued for ticket ${ticketId}`);
      return { success: true, ticketId: ticketId };

    } catch (error) {
      console.error('❌ Error sending email:', error);
      
      // Update ticket with error
      await snapshot.ref.update({
        notifyError: error.message,
        notifyAttempted: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: false, error: error.message };
    }
  });

/**
 * Optional: Auto-reply to user
 */
exports.autoReplyToUser = functions.firestore
  .document('support_tickets/{ticketId}')
  .onCreate(async (snapshot, context) => {
    const ticket = snapshot.data();
    
    // Only send auto-reply if user has email
    if (!ticket.user_email || ticket.user_email === 'Anonymous') {
      return;
    }

    const autoReplyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #f1f5f9; border-radius: 12px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #334155;">
          <h1 style="color: #10b981;">✅ We Received Your Ticket!</h1>
        </div>
        
        <div style="padding: 20px 0;">
          <p>Hi there,</p>
          <p>Thank you for contacting EarnSphere support. We have received your ticket and will get back to you within <strong>24 hours</strong>.</p>
          <p style="color: #94a3b8; font-size: 14px;">📋 Issue: ${ticket.issue_type}</p>
          <p style="color: #94a3b8; font-size: 14px;">🆔 Ticket: #${context.params.ticketId.slice(0,8)}</p>
        </div>
        
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #334155; color: #64748b; font-size: 14px;">
          <p>© 2026 EarnSphere Hub Limited</p>
        </div>
      </div>
    `;

    try {
      await admin.firestore().collection('mail').add({
        to: ticket.user_email,
        message: {
          subject: '✅ Support Ticket Received - EarnSphere',
          html: autoReplyHtml
        }
      });
      console.log(`✅ Auto-reply sent to ${ticket.user_email}`);
    } catch (error) {
      console.error('❌ Auto-reply error:', error);
    }
  });

console.log('🚀 EarnSphere Cloud Functions are running!');