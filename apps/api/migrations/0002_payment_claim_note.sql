-- Add an optional admin note to payment claims for review and correction context.
ALTER TABLE payment_claims ADD COLUMN admin_note TEXT;
