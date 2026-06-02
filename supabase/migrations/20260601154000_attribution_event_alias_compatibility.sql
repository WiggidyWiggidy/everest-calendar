DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.attribution_touches'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.attribution_touches DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.attribution_touches
  ADD CONSTRAINT attribution_touches_event_type_check
  CHECK (event_type IN (
    'session_start', 'page_view', 'product_view',
    'add_to_cart', 'checkout_start', 'order_placed',
    'cart_add_request', 'cart_add_failed',
    'whatsapp_click', 'shopify_inbox_click', 'compatibility_cta_click',
    'installation_faq_open', 'hose_connection_faq_open', 'delivery_faq_open',
    'returns_faq_open', 'comparison_section_view', 'reviews_section_view'
  ));
