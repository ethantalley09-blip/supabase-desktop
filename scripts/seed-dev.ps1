# Seeds the LOCAL Supabase stack with a working dev world. Idempotent: safe
# to re-run; safe after `npm run db:reset` (which wipes everything).
#
# Creates:
#   carol@example.com  (password123)  Owner of "Carol for Congress" (activated)
#   finn@example.com   (password123)  Canvasser in that org
#   admin@lynx.app     (password123)  SuperAdmin (flag set via direct SQL)
#   "Demo Campaign"    project with the fundraising add-on enabled
#
# Requires: Docker running with the local stack up (`npm run db:start`).
# Keys below are Supabase's standard local demo keys — not secrets.

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:54321"
$anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
$service = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

function Get-Session($email, $password) {
  # Sign up if new, otherwise sign in.
  try {
    $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" `
      -Headers @{apikey = $anon; "Content-Type" = "application/json" } `
      -Body (@{email = $email; password = $password } | ConvertTo-Json)
    if ($u.access_token) { return $u }
  } catch {}
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" `
    -Headers @{apikey = $anon; "Content-Type" = "application/json" } `
    -Body (@{email = $email; password = $password } | ConvertTo-Json)
}

function Headers($token) {
  @{apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" }
}

$svcHeaders = @{apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }

Write-Host "== Users =="
$carol = Get-Session "carol@example.com" "password123"
$finn  = Get-Session "finn@example.com"  "password123"
$admin = Get-Session "admin@lynx.app"    "password123"
Write-Host "carol/finn/admin signed in."

Write-Host "== SuperAdmin flag (direct SQL, by design no in-app path) =="
docker exec supabase_db_Lynx_Stuff psql -U postgres -d postgres -q -c `
  "update public.profiles set is_super_admin = true where email = 'admin@lynx.app';"

Write-Host "== Organization =="
$hdrC = Headers $carol.access_token
$orgs = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/organizations?select=id,org_type,status&name=eq.Carol%20for%20Congress" -Headers $hdrC
if (-not $orgs) {
  $orgs = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/organizations" -Headers $hdrC `
    -Body (@{name = "Carol for Congress"; org_type = "campaign_committee"; state_of_registration = "OH"; created_by = $carol.user.id } | ConvertTo-Json)
  Write-Host "created org (pending_payment)."
}
$orgId = $orgs[0].id

# Activate: entitlement first, then status (mirrors the SuperAdmin console).
$ent = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/entitlements?org_id=eq.$orgId&key=eq.org_active&select=id" -Headers $svcHeaders
if (-not $ent) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/entitlements" -Headers $svcHeaders `
    -Body (@{org_id = $orgId; key = "org_active"; granted_reason = "manual_admin" } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/organizations?id=eq.$orgId" -Headers $svcHeaders `
  -Body (@{status = "active" } | ConvertTo-Json) | Out-Null
Write-Host "org active + org_active entitlement granted."

Write-Host "== Finn as Canvasser =="
$mem = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/org_memberships?org_id=eq.$orgId&profile_id=eq.$($finn.user.id)&select=id" -Headers $svcHeaders
if (-not $mem) {
  $role = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/roles?is_template=eq.true&org_type_scope=eq.campaign_committee&name=eq.Canvasser&select=id" -Headers $hdrC
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/org_memberships" -Headers $hdrC `
    -Body (@{org_id = $orgId; profile_id = $finn.user.id; role_id = $role[0].id; status = "active" } | ConvertTo-Json) | Out-Null
  Write-Host "finn enrolled."
}

Write-Host "== Demo project (with fundraising add-on) =="
$proj = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/projects?org_id=eq.$orgId&name=eq.Demo%20Campaign&select=id" -Headers $hdrC
if (-not $proj) {
  $proj = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/projects" -Headers $hdrC `
    -Body (@{org_id = $orgId; name = "Demo Campaign"; state = "OH"; created_by = $carol.user.id } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/add_project_addon" -Headers $hdrC `
    -Body (@{p_project_id = $proj[0].id; p_key = "fundraising_module" } | ConvertTo-Json) | Out-Null
  Write-Host "project created with fundraising add-on."
}

Write-Host ""
Write-Host "Seed complete. Sign in at the app with any of:"
Write-Host "  carol@example.com / password123  (Owner)"
Write-Host "  finn@example.com  / password123  (Canvasser)"
Write-Host "  admin@lynx.app    / password123  (SuperAdmin -> /admin)"
