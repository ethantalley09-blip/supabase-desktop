# Political / Advocacy Technology Market: Acquisition, Pricing, Retention, and Election-Cycle Churn

Research date: 2026-10-05. Around 30 tool calls (searches and fetches). Where a fact comes only from a search-engine summary and not a fetched page, it is marked "(search summary)". Vendor pricing pages change often, so the prices below are point-in-time.

## 1. Pricing models and typical prices

### Takeaway
The market uses four pricing models: (a) flat SaaS tiers based on database or contact size, usually with unlimited users (Ecanvasser, NationBuilder, Solidarity Tech, Impactive, Qomon); (b) pay-as-you-go per-message pricing for texting and calling (Scale to Win, GetThru/ThruText, Solidarity Tech usage fees); (c) a percentage of money raised for fundraising (ActBlue about 3.95%, WinRed 3.94%); and (d) sales-led, party-mediated voter-file access priced by district size (VAN through state Democratic parties). Per-seat pricing is uncommon, because campaigns scale volunteer headcount up and down quickly.

### Cited Findings
**Field / CRM SaaS (contact-size tiers, unlimited users)**
- Ecanvasser: Core $99/mo billed monthly. The fetched page also showed "$234/month billed annually", which is internally inconsistent, so recheck it. Core database sizes are 2,500 / 20,000 / 50,000 contacts. Pro is $599/mo with 250k–1M contacts. Enterprise is custom with a **12-month minimum contract**. All plans have unlimited users and teams, and "No per-user fees. Pricing based on territory/database size." Annual billing gives "2 months free". Add-ons are $99/mo each (real-time field tracking, lead prospecting, API). There is a 7-day trial. — [Ecanvasser pricing](https://ecanvasser.com/pricing)
- NationBuilder (current pricing page): Starter $34/mo (5,000 contacts, 20k emails/mo); Pro $160/mo (10,000 contacts, 100k emails/mo, automation, membership); Enterprise is custom. Monthly billing costs about 20% more than annual. Add-ons include an **"Election pack" +$89/mo**, texting +$10–$307/mo (350–30,000 texts), ActionButton Plus +$49, and an extra website +$9. — [NationBuilder pricing](https://nationbuilder.com/pricing). A third-party price tracker reports different plans (Starter $9, Plus $39, Pro $89, Team $462), which conflicts with the fetched page. The plans may be in flux; this is unverified — [PulseSignal](https://getpulsesignal.com/changes/nationbuilder) (search summary)
- Solidarity Tech (labor and grassroots focus): four tiers (Essentials / Standard / Professional / Enterprise) covering 1,000–250,000 contacts, with seat caps of 5 / 25 / unlimited. On top of the subscription it charges usage fees:
  - Calling: $0.04/min (Essentials and Standard), $0.03/min (Professional and above)
  - SMS: $0.018 or $0.014 per text
  - Email: $0.25 or $0.20 per 1,000
  - AI call summaries: $0.10 per call; transcription: $0.75/hour
  - Customers are described as unions, nonprofits, advocacy groups, and campaigns.
  — [Solidarity Tech pricing](https://www.solidarity.tech/pricing)
- Impactive: from $50/mo, with SMS as low as 1.5¢ and dials at 4¢ — [Impactive FAQ via search](https://www.impactive.io/faqs) (search summary)
- Qomon: reported at $39/mo for a single plan — [AlternativeTo](https://alternativeto.net/software/quorum-mobilisation/about) (search summary; low-quality aggregator, unverified against Qomon's own site)

**Per-message (P2P texting)**
- Scale to Win: 1.5¢ per outbound SMS segment and 3.5¢ per MMS. Inbound messages and landline filtering are free. Pay-as-you-go, no contracts. — [Scale to Win](https://scaletowin.com/?p=529) (search summary)
- GetThru / ThruText:
  - Campaign pricing page lists 4.5¢ per message (SMS/MMS/video) — [GetThru campaigns pricing](https://www.getthru.io/getthru-pricing-campaigns) (search summary)
  - Help article says political base pricing is 3.5¢ per SMS segment and 6¢ per MMS, dropping as low as 1.5¢ per SMS for programs over $10k, plus a **$300 one-time setup fee** — [GetThru help](https://help.getthru.io/support/solutions/articles/44001063869-what-is-thrutext-s-pricing-) (search summary; the page now needs a login)
  - Separate campaign and nonprofit price sheets exist — [GetThru nonprofit pricing](https://getthru.io/getthru-pricing-nonprofit)

**Percentage of money raised (fundraising)**
- WinRed launched at 3.8% plus $0.30 per transaction. In September 2021 it dropped the 30¢ fee and raised the rate to 3.94%. ActBlue charges 3.95% with no per-transaction fee. — [HuffPost via Yahoo](https://sg.news.yahoo.com/much-touted-trump-era-fundraising-130000421.html)
- WinRed reportedly charges 3.2% on donations over $500 — [search summary citing WinRed coverage](https://episteme.tllm.fr/wiki/WinRed) (low-quality source)

**Voter file / VAN (sales-led, party-mediated)**
- NGP VAN is sales-led and many customers arrive through contracts. Capterra lists "starting at $45/mo", which is not reliable for VoteBuilder — [Capterra](https://www.capterra.com/p/148396/NGP-VAN/pricing/); [CallHub comparison](https://callhub.io/blog/political-campaign/nationbuilder-vs-ngp-van/)
- State parties set VoteBuilder pricing. In New York, price "varies based on the number of all registered voters in the respective district" plus appended data — [NY State Democratic Party VoteBuilder](https://nydems.org/action/votebuilder) (search summary)
- Republican side: the RNC Data Center gives **free access to all GOP candidates** to more than two decades of voter-contact data — (search summary; secondary source, not fetched). i360 (Koch-network-linked) sells data to conservative groups and syncs with the RNC-aligned Data Trust — [Free Beacon/ThinkProgress coverage](https://freebeacon.com/?p=317455) (search summary)

### Inferences
- Lynx's per-org paywall plus per-project add-ons resembles the NationBuilder/Ecanvasser model: tiered by size, not by seat. Charging per seat would conflict with volunteer-heavy usage, which explains why every field vendor advertises "unlimited users".
- Texting is commoditized at roughly 1.5¢ per SMS for scale programs. Margin in that category comes from volume and compliance features, not from list price.
- Fundraising processors earn a percentage of money raised, so their revenue rises automatically with peak-cycle money. They are the only category whose revenue follows campaign revenue on the way up.

### Gaps
- I found no public per-district VAN price list for any state. The ASDP's national contract terms are not public.
- I did not find public pricing for PDI, i360, Reach, Mobilize paid tiers (the pricing page returned 404), or MiniVAN (bundled with VAN).
- I could not verify Qomon's pricing tiers from a primary source.

## 2. Go-to-market: endorsements, vetting lists, channels, sales-led vs self-serve

### Takeaway
On the Democratic side, go-to-market runs through party infrastructure (the state-party VAN contracts, and the DNC voter file that grows more valuable over time) and through the Higher Ground Labs investor network. Products that are not voter-file products (Mobilize, Impactive, Hustle) grew mostly by integrating with VAN and then being acquired by a larger platform. Republicans have a parallel stack: the RNC Data Center, Data Trust, i360, and WinRed. Self-serve exists (NationBuilder, Ecanvasser, Scale to Win), but the larger contracts are sales-led.

### Cited Findings
- VoteBuilder lets Democratic campaigns "build on existing voter data from state parties and share it" with other party candidates — [Wikipedia: NGP VAN](https://en.wikipedia.org/wiki/NGP_VAN) (search summary)
- NGP VAN was the "de facto monopoly provider" for Democratic campaigns for about 16 years. Access to the DNC voter file "got even more valuable over time" — [Micah Sifry, The Connector, Apr 29 2024](https://theconnector.substack.com/p/living-with-vanxiety-the-present)
- The Association of State Democratic Parties "quietly ended its insistence that campaigns only use VAN to access their voter files". This opened room for OpenField, CTA PAD, Universe, Civitech, Votivate, Action Network, and BeCause (Demtech.ai) — [The Connector](https://theconnector.substack.com/p/living-with-vanxiety-the-present)
- PDI is the California alternative to VAN. It is also used "for IEs, consultants, and in some states, primary challengers where incumbent protection is written into the State Party's bylaws" — [NY Dems support: other databases to know](https://support.nydems.org/support/solutions/articles/63000258391-other-databases-to-know) (search summary). This shows that party gatekeeping leaves gaps (challengers, IEs) that third-party vendors fill.
- Hustle began non-partisan, then integrated NGP VAN in 2017, "shifting from non-partisan positioning to Democratic-focused operations" — [Wikipedia: Hustle](https://en.wikipedia.org/wiki/Hustle_(company))
- Higher Ground Labs: about 60 portfolio companies; roughly 30 of the 148 companies in the 2024 landscape report are HGL-funded — [Charlotte Swasey, May 16 2025](https://cauldronllc.substack.com/p/an-avalanche-of-political-tech)
- HGL seeded Impactive ($300K, July 2018, with Y Combinator) — [Seedtable](https://seedtable.com/companies/impactive/funding-rounds/seed-2018-07) (search summary)
- Campaign tech spending has stayed at "1–10%" of campaign budgets across cycles. There is a "15% increase since 2020 in campaigns purchasing tech earlier in cycles". Down-ballot and first-time candidates "struggle with tool selection and implementation". Integration across platforms is a top concern in all three survey cycles — [HGL 2024 Election Tech Survey, Feb 13 2025](https://highergroundlabs.com/takeaways-from-our-2024-election-tech-survey/)
- Competitors market directly against incumbents. The Republican vendor ISP says it gets daily calls from people unhappy with legacy vendors' "horror stories" about support and terms — [ISPolitical blog](https://ispolitical.com/blog/insights/isp-grows-as-competitors-in-possible-collapse/) (competitor marketing; treat as biased)
- Vendors publish comparison landing pages: "Impactive vs. Reach", "vs. CallHub", "vs. Switchboard"; "Solidarity Tech vs. Impactive" — [Impactive](https://www.impactive.io/lp/impactive-vs-reach); [Solidarity Tech](https://www.solidarity.tech/alternative-to/impactive)

### Inferences
- A new entrant like Lynx cannot rely on a party-mandated channel. The cracks it can use are (1) the ASDP no longer requiring VAN, (2) primary challengers and IEs who are locked out of party VAN, and (3) organizations outside campaigns (unions, nonprofits) that have no party gatekeeper.
- HGL's survey finding that tech is only 1–10% of budget, combined with first-time candidates who struggle to choose tools, points to self-serve onboarding plus templates as the way to win small campaigns. Larger buyers still expect a sales motion.

### Gaps
- I did not retrieve DNC tech vendor lists, Arena's vendor directory, Political Tech Summit material, or consultant-referral and revenue-share terms. I found no data on what share of sales come through consultants.

## 3. The election-cycle churn problem and how vendors counter it

### Takeaway
Churn in this market is structural: customers dissolve after election day. Even the vendor population turns over by more than half every two years. The surviving strategies are:
1. Sell to durable organizations (unions, nonprofits, parties, PACs).
2. Become infrastructure attached to a durable asset (a voter file, donor wallets).
3. Charge usage or percentage fees, so off-cycle costs fall along with revenue.
4. Get acquired by a durable platform.
5. Expand internationally into other countries' election calendars (Qomon).

### Cited Findings
- Vendor population churn: the 2022 landscape had about 120 companies and 2024 had about 148. Roughly 87 entered and about 75 exited between them: "over half of the set of companies churning in just 2 years" — [Swasey, May 2025](https://cauldronllc.substack.com/p/an-avalanche-of-political-tech)
- Same source on the business: revenue spikes every 4 years, smaller spikes every 2, and can collapse in between. The field is an "absolutely LOUSY place to make a pile of money". Clients bring vendors in late and push back on costs. Vendors "can't be 100% sure they'll be paid before clients shut down" — [Swasey](https://cauldronllc.substack.com/p/an-avalanche-of-political-tech)
- "Politics suffers from severe talent drain. We send our very best and brightest back into other sectors the day after Election Day." Post-2020 consolidation included the Mobilize, FactSquared, and Outreach Circle acquisitions, described as helping startups "find homes in larger entities" — [HGL, Jan 28 2021](https://highergroundlabs.com/the-evolving-startup-landscape-post-2020/)
- Hustle: grew for the 2018 midterms, then cut about 35% of staff in the post-election lull. The CEO said it was premature to expand without building product "beyond politics and nonprofits" — [TechCrunch](https://techcrunch.com/?p=1768957) (search summary citing Bloomberg)
  - Raised $11M total, including an $8M Series A led by Social Capital in 2017
  - Acquired by Social Capital in August 2020
  - Became employee-owned in April 2026
  - [Wikipedia: Hustle](https://en.wikipedia.org/wiki/Hustle_(company))
- Durable-org positioning examples:
  - Solidarity Tech targets "Labor & Grassroots Organizers" — [Solidarity Tech](https://www.solidarity.tech/pricing)
  - Impactive has a dedicated unions solution page — [Impactive unions](https://impactive.io/solutions-for/unions)
  - Action Network's Product Development Committee includes the AFL-CIO, DLCC, and DailyKos — [The Connector](https://theconnector.substack.com/p/news-the-post-24-democratic-tech)
  - In 2012, 90% of NationBuilder's clients were political or nonprofit — [socaltech](https://socaltech.com/technology_politics_makes_strange_bedfellows_for_nationbuilder/s-0045422.html) (search summary; dated)
- Contract length as a retention lever: Ecanvasser's Enterprise tier requires a 12-month minimum, and annual billing gives 2 months free — [Ecanvasser](https://ecanvasser.com/pricing). NationBuilder charges about 20% more for monthly billing — [NationBuilder](https://nationbuilder.com/pricing)
- Moving to nonprofits: Bonterra combined EveryAction with Social Solutions and CyberGrants (about $2B including debt) — [The Connector](https://theconnector.substack.com/p/living-with-vanxiety-the-present). A competitor says the acquisition repositioned NGP VAN "toward nonprofit fundraising rather than political campaigns" — [ISPolitical](https://ispolitical.com/blog/insights/isp-grows-as-competitors-in-possible-collapse/) (biased source)
- Acquisition by a durable network: ActBlue acquired Impactive on Sep 17 2025 ("Impactive by ActBlue") — [Seedtable](https://seedtable.com/exits/impactive) (search summary). EveryAction acquired Mobilize in November 2020 — [Mobilize blog](https://join.mobilize.us/blog/mobilize-joins-everyaction)
- International: Qomon was founded in October 2020 in Paris and Washington, D.C. It raised €5.5M in June 2025 (Asterion Ventures, Good Only Ventures, Ternel) to grow across Europe and North America, positioning itself as the "default mobilisation stack for volunteer-powered organisations" (campaigns plus nonprofits) — [Vestbee](https://vestbee.com/insights/articles/qomon-secures-5-5-m) (search summary)
- WinRed lost about $6M across 2021–2022, an off-cycle period, after dropping its 30¢ fee and building in-house card processing — [HuffPost via Yahoo](https://sg.news.yahoo.com/much-touted-trump-era-fundraising-130000421.html)

### Inferences
- For Lynx, the practical counters are:
  - Make the **organization**, not the campaign, the billing unit. Lynx already does this with an org paywall and per-project add-ons.
  - Keep data alive after a campaign's project ends, so the org renews for the next candidate or a ballot measure.
  - Target unions, advocacy nonprofits, and party committees, which persist through odd years.
  - Offer off-cycle products: fundraising, membership, issue campaigns.
  - Prefer annual plans, with discounts locked in before the cycle peak.
- The 12-month minimum contract and annual discounts are the standard tools for smoothing revenue through the trough.

### Gaps
- I found **no published customer-level churn rate** (for example, "X% of campaign accounts cancel after November") from any vendor.
- Two statements appeared only in search summaries with unclear sourcing: "no less than half of potential customers entirely exiting the market every year" and "every odd year, the number of races drops by 90 percent". Treat both as unverified until a primary source is found.
- I found no data on candidate-to-candidate handoff mechanics (for example, how VAN committees transfer data to successors) beyond the party-file model.

## 4. Network effects

### Takeaway
The strongest lock-in in this market comes from shared assets that accumulate across cycles, not from features:
- the party voter file, enriched by every campaign's VAN contact data;
- ActBlue's roughly 14.7M saved-payment Express donors;
- Mobilize's cross-organization volunteer network (4M volunteers and 3,000 organizations at acquisition).

These assets stay with the network when an individual campaign ends, which is how incumbents carry users through churn.

### Cited Findings
- VAN coordinated model: campaigns build on state-party voter data and share data back with other party candidates — [Wikipedia: NGP VAN](https://en.wikipedia.org/wiki/NGP_VAN) (search summary). DNC voter file access "got even more valuable over time" — [The Connector](https://theconnector.substack.com/p/living-with-vanxiety-the-present)
- ActBlue Express: about 14.77M users with saved payment information, a figure displayed on ActBlue's site in 2024 — [ActBlue Express](https://actblue.com/express) (search summary). ActBlue's own blog says Express donors give "72.9% more frequently" — [ActBlue blog](https://blog.actblue.com/?p=973) (headline via search)
- Platform scale: ActBlue processed $2.2B and WinRed $1.2B in the 2021–22 federal cycle — [HuffPost via Yahoo](https://sg.news.yahoo.com/much-touted-trump-era-fundraising-130000421.html). 2024 saw record ActBlue giving — [C&E](https://campaignsandelections.com/industry-news/report-urges-democrats-to-rethink-tech/)
- Mobilize had "a network of 3,000 organizations and 4 million volunteers" when EveryAction acquired it in November 2020 — [NGP VAN newsroom](https://www.ngpvan.com/resources/newsroom/ngp-van-invests-in-innovation-with-acquisition-of-mobilize/) (search summary). It had 4M+ active users in 2020 — [The Connector](https://theconnector.substack.com/p/living-with-vanxiety-the-present)
- GOP equivalent: the RNC Data Center holds 20+ years of voter-contact data and is free to all GOP candidates. The Data Trust and i360 share and sync data — (search summary; secondary sources). WinRed's profits are split 60/40 between Revv and Data Trust, which ties fundraising to data infrastructure — [HuffPost via Yahoo](https://sg.news.yahoo.com/much-touted-trump-era-fundraising-130000421.html)

### Inferences
- A standalone startup cannot match party-file or donor-wallet network effects. Within an org, though, the same principle applies: canvass history, door attributes, and donor links that build up across a sequence of campaigns make up the switching cost. Lynx's append-only `canvass_visits` and the persistent org data model fit this.
- Mobilize shows that a consumer-facing discovery layer, where volunteers find events across organizations, can produce cross-customer network effects even without a voter file.

### Gaps
- I found no public data on how much of Mobilize's event signups come from cross-promotion versus an org's own list.
- I did not confirm the current Express user count from a fetched primary page.

## 5. Known failures, struggles, and lessons (plus HGL market data)

### Takeaway
- Private-equity consolidation (Bonterra) produced repeated layoffs and customer defections, most visibly MoveOn leaving ActionKit after 25 years.
- Venture-scaled startups that staffed up for a peak (Hustle) had to cut afterward.
- Fee-cutting without the volume to support it (WinRed) produced losses.
- HGL's data shows Democratic tech spending at record levels ($3.6B in 2020), yet tech remains only 1–10% of campaign budgets, and integration is a chronic pain point.

### Cited Findings
- **Bonterra (NGP VAN / EveryAction / ActionKit / Mobilize):**
  - Formed in 2021 when Apax bought the EveryAction group from another PE owner (about $2B including debt)
  - Cut more than 200 staff (20%) in September 2023, nearly 350 jobs in 2023 overall, including 51 union members
  - Half of ActionKit's developers were cut, and ActionKit was internally labeled "maintain" (not grow)
  - NGP VAN was restructured as a potentially saleable unit
  - Sources: [The Intercept, Oct 5 2023](https://theintercept.com/2023/10/05/democrats-campaign-tech-layoffs-2024-bonterra-ngp-van-actionkit/); [The Connector](https://theconnector.substack.com/p/living-with-vanxiety-the-present)
  - "About one-third of its overall workforce" was laid off across two restructurings — [The Connector, post-'24](https://theconnector.substack.com/p/news-the-post-24-democratic-tech)
- **Customer defection:** MoveOn is leaving ActionKit for nonprofit Action Network (contract ends May 31 2025). Its stated reason: "due to the consolidation of core progressive technology platforms under the private equity owned firm Bonterra, coupled with repeated company layoffs and restructuring ... it's in the best interest of our organization's long-term sustainability and risk management to move in a new direction." — [The Connector](https://theconnector.substack.com/p/news-the-post-24-democratic-tech)
- **VAN stability:** in 2024, NGP VAN "generally met user demands but faced stability concerns requiring outside intervention during peak campaign moments" — [C&E on HGL 2024 report](https://campaignsandelections.com/industry-news/report-urges-democrats-to-rethink-tech/)
- **Product stagnation pattern:** Middle Seat's Kenneth Pennington says Democratic software tends to get built, after which vendors "stop updating it, you stop working on it" — quoted in [ISPolitical](https://ispolitical.com/blog/insights/isp-grows-as-competitors-in-possible-collapse/) (citing Politico)
- **Hustle:**
  - Cut about 35% of staff after the 2018 midterms — [TechCrunch](https://techcrunch.com/?p=1768957)
  - In September 2024, Palihapitiya (Social Capital, the owner) hosted a $12M Trump fundraiser, which angered Democratic clients. A new CEO came in February 2025, and employees bought the company in April 2026. Lesson: partisan trust is part of the product — [Wikipedia: Hustle](https://en.wikipedia.org/wiki/Hustle_(company))
- **NationBuilder:** ran into conflict with Democratic groups after it sold to Republican candidates (2012) — [socaltech](https://socaltech.com/technology_politics_makes_strange_bedfellows_for_nationbuilder/s-0045422.html) (search summary). I could not confirm reports of a recent NationBuilder decline or layoffs (see Gaps).
- **WinRed:** lost about $6M in 2021–22 — [HuffPost via Yahoo](https://sg.news.yahoo.com/much-touted-trump-era-fundraising-130000421.html)
- **HGL market data:**
  - Democratic tech spending reached a record $3.6B in 2020 — [HGL 2020 report](https://highergroundlabs.com/our-2020-political-tech-landscape-report/)
  - The 2024 landscape covers about 148 companies across six categories (Media & Messaging; Data Analytics & Modeling; Research; Volunteer & Activist Mobilization and Voter Engagement; Fundraising; Movement-Wide Infrastructure) — [beSpacific summary](https://www.bespacific.com/?p=113641); [Swasey](https://cauldronllc.substack.com/p/an-avalanche-of-political-tech)
  - HGL's verdict: "The gap between what is technically possible and what is strategically effective remains too wide" — [beSpacific](https://www.bespacific.com/?p=113641)
  - "Foundational pieces of movement tech are under strain"; the HGL AI Lab trained 3,600+ people — [C&E](https://campaignsandelections.com/industry-news/report-urges-democrats-to-rethink-tech/)
  - AI use is mostly content generation; few campaigns use it for predictive modeling — [HGL survey](https://highergroundlabs.com/takeaways-from-our-2024-election-tech-survey/)
- **Proposed lesson:** Swasey argues for "platform neutrality and interoperability" to reduce vendor lock-in — [Swasey](https://cauldronllc.substack.com/p/an-avalanche-of-political-tech)

### Inferences
- Lessons for Lynx:
  1. Keep fixed costs flexible, and don't staff for the peak.
  2. Reliability at peak (GOTV week) is a retention event. VAN's 2024 instability and Bonterra's cuts drove defections.
  3. Mission and partisan alignment of ownership matters to buyers (MoveOn, Hustle).
  4. Interoperability with VAN, ActBlue, and Action Network lowers adoption friction, because integration is the top complaint in HGL surveys.
  5. Nonprofit or employee-owned governance is now a selling point competitors use against PE-owned incumbents.
- AI adoption is still shallow (mostly content generation). That leaves room for AI analysis features grounded in real data, which is Lynx's positioning, though only if training and onboarding are included.

### Gaps
- I found no reliable 2022–2026 reporting on NationBuilder layoffs or revenue decline. The task premise of a "NationBuilder decline" is unverified here.
- HGL's 2024 total-spending figure was not available on any fetched page; the full report is on DocSend (https://docsend.com/view/f9huvk5k8ptct4b9) and was not retrieved.
- Not covered: Reach (funding or acquisition status), Grassroots Analytics, MiniVAN specifics, PDI ownership and finances, and named startups that died after 2020 (beyond the general 75-exits figure).
- Crunchbase, Political Tech Summit, and podcast interviews were not consulted.
