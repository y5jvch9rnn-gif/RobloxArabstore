# Server example for PayPal + Supabase (Node)

هذا المجلد يحتوي مثال بسيط لخادم يستخدم مفاتيح بايبال و SUPABASE_SERVICE_ROLE بأمان على السيرفر.

متطلبات:
- Node 18+
- متغيرات البيئة:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE
  - PAYPAL_CLIENT_ID
  - PAYPAL_CLIENT_SECRET
  - (optional) PAYPAL_API (افتراضي sandbox)

نشر سريع (Vercel): ضع هذا المجلد كمصدر لـ serverless functions أو قم بتحويل الدوال للمسارات المناسبة.

ملاحظة أمنية: لا تقم بوضع SUPABASE_SERVICE_ROLE أو PAYPAL_CLIENT_SECRET في المستودع.
