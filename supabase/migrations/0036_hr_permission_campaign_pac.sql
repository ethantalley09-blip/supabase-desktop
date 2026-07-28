-- Bug fix, caught by live-signing-in as a seeded Owner for the first time
-- since 0033_staffing_logistics.sql was written (that whole session had no
-- Docker running, so this was never actually exercised end to end).
--
-- 0003_roles.sql only ever gave the Owner template hr.view/hr.manage for the
-- 'party_committee' and 'nonprofit' org_type_scope variants -- a deliberate
-- product choice at the time (HR/Payroll roles didn't exist for
-- 'campaign_committee'/'pac' at all). But 0033 built the Staffing/Logistics
-- feature reusing hr.view/hr.manage on the assumption Owner already had it
-- everywhere ("already granted... a strong signal they were anticipated" --
-- HANDOFF.md), and its own resume instructions assert "carol@example.com
-- (Owner — has hr.manage)". carol's seeded org is 'campaign_committee', the
-- product's primary org type, so that assumption was wrong there: the
-- Staffing/Logistics section (and every advisor answer that reads it --
-- "Who is scheduled today?", "What is our projected hotel cost?") was
-- completely invisible to the one role campaigns actually use.
--
-- Fix: extend Owner's grant to 'campaign_committee' and 'pac' too, matching
-- what 'party_committee'/'nonprofit' Owners already have. Not adding a
-- dedicated HR role template for these org types -- that's a bigger, more
-- speculative product decision than this bug fix calls for; Owner-level
-- access is the minimal change that makes the already-built feature usable.
update public.roles
set permissions = permissions || '{"hr.view": true, "hr.manage": true}'::jsonb
where is_template = true and name = 'Owner' and org_type_scope in ('campaign_committee', 'pac');
