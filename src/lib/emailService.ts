import emailjs from '@emailjs/browser';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface EmailSettings {
  enabled: boolean;
  serviceId: string;
  templateId: string;
  publicKey: string;
  adminEmail: string;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: false,
  serviceId: '',
  templateId: '',
  publicKey: '',
  adminEmail: 'MovingTexasRealty@gmail.com'
};

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const snap = await getDoc(doc(db, 'system', 'email_settings'));
    if (snap.exists()) {
      return { ...DEFAULT_EMAIL_SETTINGS, ...snap.data() } as EmailSettings;
    }
  } catch (err) {
    console.error('Error fetching email settings:', err);
  }
  return DEFAULT_EMAIL_SETTINGS;
}

export async function saveEmailSettings(settings: EmailSettings): Promise<void> {
  try {
    await setDoc(doc(db, 'system', 'email_settings'), settings);
  } catch (err) {
    console.error('Error saving email settings:', err);
    throw err;
  }
}

export async function sendAdminNotificationEmail(
  params: {
    title: string;
    agentName: string;
    propertyAddress: string;
    message: string;
    requestId?: string;
  },
  overrideSettings?: EmailSettings,
  isTest: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = overrideSettings || (await getEmailSettings());

    if (!settings.serviceId || !settings.templateId || !settings.publicKey) {
      console.log('EmailJS parameters missing.');
      return { success: false, error: 'Please enter Service ID, Template ID, and Public Key.' };
    }

    if (!isTest && !settings.enabled) {
      console.log('EmailJS notifications are disabled in settings.');
      return { success: false, error: 'EmailJS notifications are disabled.' };
    }

    const templateParams = {
      to_email: settings.adminEmail || 'MovingTexasRealty@gmail.com',
      title: params.title,
      agent_name: params.agentName,
      property_address: params.propertyAddress,
      message: params.message,
      request_id: params.requestId || '',
      submit_date: new Date().toLocaleString()
    };

    // Create a promise that rejects after 12 seconds to prevent infinite hanging
    const timeoutPromise = new Promise<{ status: number; text: string }>((_, reject) =>
      setTimeout(() => reject(new Error('EmailJS request timed out after 12s. Check your Service ID, Template ID, or Public Key.')), 12000)
    );

    const sendPromise = emailjs.send(
      settings.serviceId.trim(),
      settings.templateId.trim(),
      templateParams,
      settings.publicKey.trim()
    );

    const response = await Promise.race([sendPromise, timeoutPromise]);

    console.log('EmailJS notification sent successfully:', response.status, response.text);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to send EmailJS notification:', err);
    const errorMsg = err?.text || err?.message || (typeof err === 'string' ? err : 'Failed to send email. Check EmailJS credentials.');
    return { success: false, error: errorMsg };
  }
}
