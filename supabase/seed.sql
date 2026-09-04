-- ============================================================================
-- Demo seed data. Run AFTER schema.sql.
-- Everything here is is_demo = true so the app can visually distinguish it
-- from real usage (e.g. a "Demo data" badge in the dashboard) rather than
-- mixing it in indistinguishably.
--
-- Replace the owner_id UUIDs below with a real auth.users id after you've
-- signed up once locally — Supabase requires businesses.owner_id to
-- reference an existing user under RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
insert into businesses (id, owner_id, name, business_type, phone_number, default_language, timezone, is_demo)
values
  ('11111111-1111-1111-1111-111111111111', :'demo_owner_id', 'SweetCrust Bakery', 'cake_shop', '+91 98765 43210', 'en', 'Asia/Kolkata', true),
  ('22222222-2222-2222-2222-222222222222', :'demo_owner_id', 'CarePoint Clinic', 'clinic', '+91 98765 11223', 'en', 'Asia/Kolkata', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- SweetCrust Bakery — Cake Shop workflow
-- ---------------------------------------------------------------------------
insert into workflows (id, business_id, name, trigger, greeting, assistant_role, tone, closing_message, language, status)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Missed Call — Cake Enquiry',
  'missed_call',
  'Hi! Thanks for calling SweetCrust Bakery — sorry we missed you. I''m the bakery''s assistant, happy to help right now.',
  'You are the friendly front-of-shop assistant for a bakery that makes custom cakes. You help customers place cake orders and answer general questions about the shop.',
  'warm_friendly',
  'Thanks so much! We''ve got everything we need — someone from the team will confirm the details with you shortly.',
  'en',
  'active'
)
on conflict (id) do nothing;

insert into workflow_intents (id, workflow_id, intent_key, label, description, display_order)
values
  ('33333333-aaaa-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'order_cake', 'Order a cake',
   'The customer wants to place a custom cake order.', 0),
  ('33333333-aaaa-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'general_enquiry', 'General enquiry',
   'The customer has a question about the shop, hours, or something other than placing an order.', 1)
on conflict (id) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, select_options, display_order)
values
  ('33333333-aaaa-1111-1111-111111111111', 'cake_type', 'Cake type', 'text', 'What kind of cake — birthday, wedding, anniversary, etc.', true, null, 0),
  ('33333333-aaaa-1111-1111-111111111111', 'flavour', 'Flavour', 'select', 'Preferred cake flavour', true,
   '["Chocolate","Vanilla","Red Velvet","Black Forest","Butterscotch","Fruit"]'::jsonb, 1),
  ('33333333-aaaa-1111-1111-111111111111', 'weight', 'Weight (kg)', 'number', 'Approximate cake weight in kilograms', true, null, 2),
  ('33333333-aaaa-1111-1111-111111111111', 'required_date', 'Required date', 'date', 'When the customer needs the cake, resolved to an ISO date', true, null, 3),
  ('33333333-aaaa-1111-1111-111111111111', 'custom_message', 'Message on cake', 'text', 'Text to write on the cake, if any', false, null, 4),
  ('33333333-aaaa-1111-1111-111111111111', 'delivery_preference', 'Delivery or pickup', 'select', null, true,
   '["Delivery","Pickup"]'::jsonb, 5),
  ('33333333-aaaa-1111-1111-111111111111', 'budget', 'Budget (INR)', 'number', 'Customer''s approximate budget', false, null, 6)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, display_order)
values
  ('33333333-aaaa-2222-2222-222222222222', 'enquiry_topic', 'Enquiry topic', 'text', 'What the customer wants to know', true, 0)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_conditions (workflow_intent_id, condition_definition, resulting_action, priority)
values
  ('33333333-aaaa-1111-1111-111111111111',
   '{"field": "required_date", "op": "within_hours", "value": 24}'::jsonb,
   '{"type": "set_priority", "value": "urgent"}'::jsonb,
   0);

insert into workflow_actions (workflow_intent_id, action_type, trigger_on)
values
  ('33333333-aaaa-1111-1111-111111111111', 'create_enquiry', 'completion'),
  ('33333333-aaaa-1111-1111-111111111111', 'create_followup', 'completion'),
  ('33333333-aaaa-1111-1111-111111111111', 'notify_owner', 'completion'),
  ('33333333-aaaa-2222-2222-222222222222', 'create_followup', 'completion');

-- ---------------------------------------------------------------------------
-- CarePoint Clinic — Appointment workflow
-- ---------------------------------------------------------------------------
insert into workflows (id, business_id, name, trigger, greeting, assistant_role, tone, restrictions, closing_message, language, status)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  'Missed Call — Appointment Line',
  'missed_call',
  'Hello, this is CarePoint Clinic''s assistant — sorry we missed your call. How can I help today?',
  'You are the front-desk assistant for a general clinic. You help patients book, reschedule, or cancel appointments and answer basic non-medical questions.',
  'calm_professional',
  'You must never give medical advice or diagnose symptoms. If a caller describes a medical emergency, immediately tell them to call local emergency services or go to the nearest emergency room, and do not continue collecting appointment details.',
  'Thank you — your appointment request has been noted and the clinic will confirm shortly.',
  'en',
  'active'
)
on conflict (id) do nothing;

insert into workflow_intents (id, workflow_id, intent_key, label, description, display_order)
values
  ('44444444-aaaa-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'book_appointment', 'Book appointment',
   'Patient wants to book a new appointment.', 0),
  ('44444444-aaaa-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'reschedule', 'Reschedule appointment',
   'Patient wants to move an existing appointment to a new time.', 1),
  ('44444444-aaaa-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'cancel', 'Cancel appointment',
   'Patient wants to cancel an existing appointment.', 2),
  ('44444444-aaaa-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'general_enquiry', 'General enquiry',
   'Non-medical question about the clinic (hours, location, insurance, etc).', 3)
on conflict (id) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, display_order)
values
  ('44444444-aaaa-1111-1111-111111111111', 'patient_name', 'Patient name', 'text', null, true, 0),
  ('44444444-aaaa-1111-1111-111111111111', 'doctor_or_speciality', 'Doctor / speciality', 'text', 'Which doctor or department, e.g. "Dr. Rao" or "Dermatology"', true, 1),
  ('44444444-aaaa-1111-1111-111111111111', 'preferred_date', 'Preferred date', 'date', null, true, 2),
  ('44444444-aaaa-1111-1111-111111111111', 'preferred_time', 'Preferred time', 'time', 'HH:MM, 24-hour', true, 3)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, display_order)
values
  ('44444444-aaaa-2222-2222-222222222222', 'patient_name', 'Patient name', 'text', null, true, 0),
  ('44444444-aaaa-2222-2222-222222222222', 'preferred_date', 'New preferred date', 'date', null, true, 1),
  ('44444444-aaaa-2222-2222-222222222222', 'preferred_time', 'New preferred time', 'time', null, true, 2)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, display_order)
values
  ('44444444-aaaa-3333-3333-333333333333', 'patient_name', 'Patient name', 'text', null, true, 0)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_fields (workflow_intent_id, field_name, label, field_type, description, required, display_order)
values
  ('44444444-aaaa-4444-4444-444444444444', 'enquiry_topic', 'Enquiry topic', 'text', null, true, 0)
on conflict (workflow_intent_id, field_name) do nothing;

insert into workflow_actions (workflow_intent_id, action_type, trigger_on)
values
  ('44444444-aaaa-1111-1111-111111111111', 'create_calendar_event', 'completion'),
  ('44444444-aaaa-1111-1111-111111111111', 'create_followup', 'completion'),
  ('44444444-aaaa-2222-2222-222222222222', 'create_followup', 'completion'),
  ('44444444-aaaa-3333-3333-333333333333', 'create_followup', 'completion'),
  ('44444444-aaaa-4444-4444-444444444444', 'create_followup', 'completion');

-- ---------------------------------------------------------------------------
-- Demo conversations — a mix of statuses/priorities so the dashboard never
-- opens empty. These are inserted directly (not run through the orchestrator)
-- since they represent past history, not a live turn.
-- ---------------------------------------------------------------------------
insert into conversations (id, business_id, workflow_id, workflow_intent_id, mode, customer_name, customer_phone, language, status, priority, summary, started_at, completed_at, is_demo)
values
  ('55555555-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   '33333333-aaaa-1111-1111-111111111111', 'simulated', 'Rahul Menon', '+91 90000 00001', 'en', 'completed', 'urgent',
   'Rahul needs a 1kg chocolate truffle birthday cake tomorrow evening, pickup preferred, wrote "Happy Birthday Aisha" as the message.',
   now() - interval '1 day', now() - interval '1 day' + interval '6 minutes', true),
  ('55555555-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   '33333333-aaaa-1111-1111-111111111111', 'simulated', 'Priya Nair', '+91 90000 00002', 'en', 'completed', 'normal',
   'Priya ordered a 2kg red velvet cake for a birthday next week, delivery to her home address, budget around ₹2500.',
   now() - interval '3 days', now() - interval '3 days' + interval '5 minutes', true),
  ('55555555-0003-0003-0003-000000000003', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
   '44444444-aaaa-1111-1111-111111111111', 'simulated', 'Ananya Iyer', '+91 90000 00003', 'en', 'completed', 'normal',
   'Ananya booked a dermatology appointment for next Tuesday at 4 PM with Dr. Rao.',
   now() - interval '2 days', now() - interval '2 days' + interval '4 minutes', true),
  ('55555555-0004-0004-0004-000000000004', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
   null, 'simulated', 'Vikram Shah', '+91 90000 00004', 'en', 'abandoned', 'normal', null,
   now() - interval '5 hours', null, true)
on conflict (id) do nothing;

insert into collected_data (conversation_id, field_name, field_value, confidence) values
  ('55555555-0001-0001-0001-000000000001', 'cake_type', 'Birthday cake', 0.95),
  ('55555555-0001-0001-0001-000000000001', 'flavour', 'Chocolate', 0.98),
  ('55555555-0001-0001-0001-000000000001', 'weight', '1', 0.9),
  ('55555555-0001-0001-0001-000000000001', 'required_date', (now() + interval '18 hours')::text, 0.85),
  ('55555555-0001-0001-0001-000000000001', 'custom_message', 'Happy Birthday Aisha', 0.97),
  ('55555555-0001-0001-0001-000000000001', 'delivery_preference', 'Pickup', 0.9),

  ('55555555-0002-0002-0002-000000000002', 'cake_type', 'Birthday cake', 0.9),
  ('55555555-0002-0002-0002-000000000002', 'flavour', 'Red Velvet', 0.97),
  ('55555555-0002-0002-0002-000000000002', 'weight', '2', 0.9),
  ('55555555-0002-0002-0002-000000000002', 'required_date', (now() + interval '9 days')::text, 0.8),
  ('55555555-0002-0002-0002-000000000002', 'delivery_preference', 'Delivery', 0.9),
  ('55555555-0002-0002-0002-000000000002', 'budget', '2500', 0.75),

  ('55555555-0003-0003-0003-000000000003', 'patient_name', 'Ananya Iyer', 0.99),
  ('55555555-0003-0003-0003-000000000003', 'doctor_or_speciality', 'Dr. Rao (Dermatology)', 0.9),
  ('55555555-0003-0003-0003-000000000003', 'preferred_date', (now() + interval '6 days')::text, 0.85),
  ('55555555-0003-0003-0003-000000000003', 'preferred_time', '16:00', 0.9)
on conflict (conversation_id, field_name) do nothing;

insert into actions (conversation_id, action_type, status, metadata) values
  ('55555555-0001-0001-0001-000000000001', 'create_enquiry', 'success', '{"priority":"urgent"}'::jsonb),
  ('55555555-0001-0001-0001-000000000001', 'create_followup', 'success', '{"priority":"urgent"}'::jsonb),
  ('55555555-0001-0001-0001-000000000001', 'notify_owner', 'pending', '{"reason":"No notification provider configured in this delivery."}'::jsonb),
  ('55555555-0002-0002-0002-000000000002', 'create_enquiry', 'success', '{"priority":"normal"}'::jsonb),
  ('55555555-0002-0002-0002-000000000002', 'create_followup', 'success', '{"priority":"normal"}'::jsonb),
  ('55555555-0003-0003-0003-000000000003', 'create_calendar_event', 'failed', null),
  ('55555555-0003-0003-0003-000000000003', 'create_followup', 'success', '{"priority":"normal"}'::jsonb);

update actions set error_message = 'Demo data — no Google Calendar connected for this seeded business.'
where conversation_id = '55555555-0003-0003-0003-000000000003' and action_type = 'create_calendar_event';

insert into follow_ups (conversation_id, status, priority) values
  ('55555555-0001-0001-0001-000000000001', 'open', 'urgent'),
  ('55555555-0002-0002-0002-000000000002', 'contacted', 'normal'),
  ('55555555-0003-0003-0003-000000000003', 'open', 'normal');
