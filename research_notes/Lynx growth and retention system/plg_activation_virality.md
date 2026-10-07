# PLG, Product-Led Sales Hybrids, Activation Design, and Viral/Referral Loops for B2B SaaS (2023-2026), with transfer notes for Lynx

Scope note: about 15 searches/fetches. Primary sources fetched directly: ProductLed benchmarks, Lenny's free-to-paid post, Growth Unhinged "AI churn wave", the Reforge growth loops essay, Elena Verna on B2B activation, Bessemer State of AI 2025 (search summary of the report page/PDF), and the Figma S-1 (search summary). Everything else came from secondary or aggregator pages and is marked as such. Lynx context: one admin pays (org creation, paid add-ons), many volunteers and canvassers use the product for free, and accounts are free.

## Q1. Which growth-loop and PLG frameworks have the best evidence, and what are the real benchmark numbers (free-to-paid, activation, PQL conversion, K-factor, viral cycle time)?

### Takeaway
Loops over funnels (Reforge, 2018) is still the dominant framework, but it's a way of thinking, not a measured result. The hard numbers come from benchmark surveys. Freemium converts about 3-8% of sign-ups to paid and free trials about 8-25% (Lenny/OpenView/Pendo, 2023). PQLs convert about 25-39% (ProductLed, 2022). Median activation is about 25-36% (Lenny/Timen, 2022). In B2B, a K-factor above 1 is rare. Treat virality as an amplifier (K of roughly 0.2-0.7) on other channels and push hard on cycle time.

### Cited Findings
**Frameworks**
- Reforge defines growth loops as "closed systems where the inputs through some process generates more of an output that can be reinvested in the input." Its argument is that funnels create strategic silos (product vs channel vs monetization) and functional silos, and that funnels have no compounding mechanism. It also says the "fastest growing products are typically powered by 1-2 major loops." Authors: Brian Balfour, Casey Winters, Kevin Kwok, Andrew Chen; published July 31, 2018 (older, but still the reference text). Pinterest's loop is the worked example: saved content gets indexed by search engines, which brings in new users. — [Reforge, "Growth Loops are the New Funnels"](https://www.reforge.com/blog/growth-loops)
- Reforge's activation model splits activation into setup, aha, and habit, and the essay (Elena Verna) argues that most onboarding stops at setup. — [Elena Verna, Oct 5 2023](https://www.elenaverna.com/p/hey-b2b-i-bet-you-are-measuring-activation)

**Free-to-paid conversion**
- Lenny's Newsletter, Kyle Poyar (OpenView), and Pendo surveyed 1,000+ B2B SaaS products (published Aug 1, 2023). Conversion is measured over a 6-month window:
  - Freemium self-serve: good 3-5%, great 6-8%
  - Freemium with sales-assist: good 5-7%, great 10-15%
  - Free trial: good 8-12%, great 15-25%
  - Products aimed at developers convert at a 5% median, half the rate of non-developer products.
  - 20% of freemium products convert below 2.5%, and 33% convert at 2.5-5%.
  - Visitor-to-signup is 9% for freemium and 5% for trials.
  — [Lenny's Newsletter, "What is a good free-to-paid conversion rate"](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion)
  - Conflict: a search-engine snippet of the same post flipped these ranges (freemium 8-12%/15-25%, trials 3-5%/6-8%). The fetched page itself has freemium lower and trials higher, which matches every other source. Use the fetched figures.
- ProductLed's survey (600+ SaaS companies, with Gainsight and RevOps; **2022 data, so older**) found:
  - Overall median free-to-paid conversion of 9%
  - 10% median at $1K-$5K ACV (the highest bracket)
  - 24% top-quartile conversion for ACV under $1K
  - Only 34% of companies track activation at all
  - 58% have a PLG motion
  - 91% plan to increase PLG investment
  — [ProductLed Benchmarks](https://productled.com/blog/product-led-growth-benchmarks)
- Unverified: opt-out (card-required) trials reportedly convert at 48.8% vs 18.2% for opt-in, and traditional freemium at 2.6% free-to-paid. These figures appeared only in a search snippet attributed to Lenny's post. They were not in the fetched page and are probably older Totango-era data. Do not use them without checking. — [Lenny's Newsletter snippet](https://lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion)

**Activation**
- Lenny Rachitsky and Yuriy Timen surveyed 500+ respondents (2022):
  - All products: 34% average activation, 25% median
  - SaaS only: 36% average, 25% median
  - B2B enterprise SaaS: 33% median, with 40% at about the 60th percentile and 65% at about the 80th
  — [Lenny's Newsletter, "What is a good activation rate"](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
  - Note: the 80th-percentile figure is "8th" in the source snippet, almost certainly a typo for 80th.
- Aggregator figures for 2025-26: "good" activation is 20-40%, "excellent" is above 50%, and best-in-class is above 70%. These come from secondary blogs with unclear methods, so they are low confidence. — [Shno PLG statistics](https://www.shno.co/marketing-statistics/product-led-growth-statistics), [Flowjam](https://www.flowjam.com/blog/product-led-growth-playbook-2025-no-fluff-guide-for-saas)

**PQLs (product-qualified leads)**
- ProductLed, 2022 data:
  - Free trials that use PQLs convert at about 25% on average
  - 30% at $1K-$5K ACV
  - 39% at $5K-$10K ACV
  — [ProductLed Benchmarks](https://productled.com/blog/product-led-growth-benchmarks)
- Several secondary sources compare this with 5-10% for MQLs. — [Shno](https://www.shno.co/marketing-statistics/product-led-growth-statistics)

**K-factor and viral cycle time**
- K = i × c, where i is invites per user and c is the invite conversion rate. K > 1 means self-sustaining growth. K < 1 still amplifies acquisition. A sustained K > 1 is rare and usually temporary. — [LaunchList K-factor guide (secondary, citing Andrew Chen)](https://app.getlaunchlist.com/blog/viral-coefficient-k-factor-guide)
- The same guide says typical healthy K is about 0.3-0.7 (for waitlists), and that K above 1.0 is "mostly a consumer phenomenon". It says B2B cycle times are longer because of procurement, security review, and multiple stakeholders, so cutting cycle time matters as much as raising K. — [LaunchList](https://app.getlaunchlist.com/blog/viral-coefficient-k-factor-guide)

### Inferences
- Lynx sells to an admin who buys for an org and doesn't trial in a self-serve way. The closest benchmark is "freemium with sales-assist", where 5-7% is good and 10-15% is great. Lynx should measure conversion at the **org/account** level, not per user, because free volunteers will never pay and including them dilutes the denominator.
- Lynx gets the PQL uplift (25-39% vs single-digit MQL rates) if "paid-ready" is defined by real usage: for example, a campaign that has imported voters, has at least 3 canvassers logging visits, and is approaching the $1,000 compliance unlock.

### Gaps
- No rigorous public benchmark for B2B K-factor or viral cycle time was found. Published K values are almost all consumer or anecdotal.
- OpenView shut down in late 2023, so its annual PLG benchmark series stopped after the 2023 edition. No primary 2025-26 replacement with comparable sample sizes was found. The 2025-26 "benchmark" pages found are aggregators.
- No vertical benchmarks exist for political-campaign or advocacy SaaS.

## Q2. How do collaboration products get "invite virality", and what are the best case studies?

### Takeaway
The strongest B2B virality is **inherent**: the core workflow can't be finished without bringing in another person. Calendly needs an invitee to book, and a Figma file needs reviewers and developers. The pricing that makes this work charges creators or editors and keeps viewers and collaborators free. Incentivized referral (Dropbox) works, but its strongest evidence is old and from consumer and prosumer products.

### Cited Findings
**Figma (primary source: S-1)**
- Non-designers made up two-thirds of Figma's 13M+ MAU (quarter ending Mar 31 2025).
- Net dollar retention was 132% at Mar 31 2025 and 134% at Dec 31 2024.
- Figma had 13,861 paid customers with more than $10K ARR as of Dec 31 2025 (this figure came from the search summary, which mixes in FY2025 results).
— [Figma Form S-1 (SEC)](https://www.sec.gov/Archives/edgar/data/1579878/000162828025033742/figma-sx1.htm); [Figma FY2025 results](https://www.barchart.com/story/news/289477/figma-announces-fourth-quarter-and-fiscal-year-2025-financial-results)

**Figma (secondary sources)**
- Viewers are free and only editors pay (from about $12 per editor per month), so one paying designer brings in dozens of free users.
- Sharing a link is a lightweight invite that can be dropped into tickets, chat, and docs.
- The core workflows (feedback, approval, developer handoff) can't be completed without bringing in new people.
— [Vortex Software (secondary)](https://blog.vortexsoftware.com/how-figma-turned-design-sharing-into-a-billion-dollar-growth-engine)

**Calendly (secondary)**
- The product needs two people, so every booking is a product demo for the invitee.
- The invitee sees Calendly branding during booking and on the confirmation, then gets an immediate call to action to create a free page.
- Earlier tools (TimeTrade, ScheduleOnce) didn't put that sign-up call to action inside the booking flow.
- Reported ARR: about $40M (2019), $125M (2021), and $270M (end of 2023), with 20M users and use at 86% of the Fortune 500. These are Sacra estimates, not audited figures.
— [Sacra on Calendly](https://sacra.com/chat/h/e203c170-aac9-4957-b097-0edc3326aa1a/); [Henry the PMM](https://henrythepmm.substack.com/p/7-lessons-from-calendlys-3b-gtm-playbook)

**Dropbox (older evidence: 2008-2010)**
- The two-sided reward was 500MB of storage for both referrer and invitee.
- Sign-ups grew from 100K to 4M in 15 months (+3,900%).
- At peak, referrals were 35% of sign-ups.
- Referrals reportedly beat paid acquisition by 2.8x.
— [The Growth Playbook (secondary)](https://thegrowthplaybook.substack.com/p/how-dropbox-grew-3900-in-15-months); [Fortune 2011, Dropbox at 25M users](https://fortune.com/2011/04/18/dropbox-25-million-users-and-counting)

**Team-level activation (Elena Verna)**
- B2B companies must activate *teams*, not just users: "a large number of individual users doesn't guarantee successful bottom-up selling."
- SurveyMonkey had 800+ paid and 1,000+ free active accounts inside single companies, yet enterprise sales repeatedly failed because those users worked in silos.
- Her examples of collaborative activation definitions: Miro is activated at 2+ people collaborating, and Dropbox at shared-file editing or viewing.
— [Elena Verna](https://www.elenaverna.com/p/hey-b2b-i-bet-you-are-measuring-activation)

### Inferences
- Lynx's structure is the Figma pattern: the admin pays and volunteers are free "viewers/doers". Its inherent loop is that **an admin can't run a canvass without inviting canvassers**. The invite is the work itself, not a growth feature added on top. The design goals are:
  - Make the invite one link (QR or SMS) with no account friction.
  - Make the canvasser's first door log happen within minutes.
  - Count an org as "activated" only once N volunteers have logged real activity (Verna's team-activation principle).
- The more valuable external loop is **cross-org**: volunteers and staff move between campaigns each cycle, and a canvasser who used Lynx on one campaign can bring it to the next one, much as Calendly invitees go on to create their own pages. That points to a lightweight "Start your own org" call to action shown to volunteers and invitees, the equivalent of Calendly's post-booking prompt. Because org creation is paid, that call to action leads to a paid sign-up.
- Public-facing surfaces (donation pages, event registrations, petitions, which already exist in Lynx's integrations) could carry light branding as a Calendly-style exposure loop. Whether that's acceptable to campaigns is a product question.
- Dropbox-style two-sided incentives (for example, a credit for referring another org) carry weaker modern evidence. They fit better as an amplifier than as the core loop.

### Gaps
- No published K-factor or invite-acceptance rate for Figma, Calendly, Loom, or Notion was found. Their virality is documented qualitatively, plus outcome figures from S-1s and estimates.
- Loom and Notion case studies weren't fetched for lack of budget, so no numbers are cited for them.
- No data on referral programs or invite virality in political or advocacy software.

## Q3. How should activation and aha moments be identified and designed?

### Takeaway
Define activation as a specific, measurable behavior within a time window that correlates with long-term retention. Slack used 2,000 team messages. Design onboarding to get users through setup, then aha, then habit, and don't stop at setup. In B2B, define it at the account or team level.

### Cited Findings
- Slack: Stewart Butterfield said a team that has exchanged 2,000 messages has "really tried" Slack, and 93% of those teams were still using it. For a 10-person team that's about a week of messages. **This is from the mid-2010s and is reported mostly second-hand** (Andrew Chen's *The Cold Start Problem* and case-study sites). — [Goodreads notes on The Cold Start Problem](https://www.goodreads.com/notes/56962799-the-cold-start-problem/84411704-mikko-ikola/435bc888-c6a7-45f1-83c2-6c66617e1ab2); [IdeaPlan Slack case study](https://www.ideaplan.io/case-studies/slack-product-led-growth)
  - Conflict: one secondary source restates this as "93% conversion to long-term paid users", but the original quote is about continued usage, not payment.
- Setup, aha, and habit stages:
  - **Setup** is the prerequisite actions.
  - **Aha** is the first experience of the core value.
  - **Habit** is the repeated core behavior at the intended frequency.
  - The most common mistake is stopping activation work at setup.
  — [Elena Verna](https://www.elenaverna.com/p/hey-b2b-i-bet-you-are-measuring-activation); [June activation playbook](https://www.june.so/blog/activation-playbook); [InnerTrends on the habit moment](https://innertrends.com/data-analyses/identify-the-habit-moment-the-key-to-long-term-retention)
- Verna found that a 3-screen, 9-question onboarding survey caused only about 10% dropout and had no effect on habit-loop completion, so asking questions to segment users isn't necessarily costly. — [Elena Verna](https://www.elenaverna.com/p/hey-b2b-i-bet-you-are-measuring-activation)
- Activation shouldn't be defined as just sign-up: that "defies the purpose" of a leading indicator. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
- Reforge's method is to name the aha moment in plain words, then tie it to a measurable action within a time window, and judge every onboarding step by whether it speeds up time to value. — [summary from search of Reforge-derived materials](https://echai.ventures/startingup/growth-metrics/how-do-i-measure-activation-and-where-should-the-activation-moment-actually-sit-in-my-onboarding)

### Inferences
- Candidate Lynx activation events, all to be validated by correlating each against 60/90-day org retention and conversion:
  - **Setup**: org created, voter file imported and geocoded, first turf drawn, at least 1 volunteer invited.
  - **Aha**: first canvass shift where several volunteers log real `canvass_visits`, and the admin sees a live map or heatmap update.
  - **Habit**: weekly shifts with logged visits across 3+ consecutive weeks, or a recurring broadcast cadence.
- The analysis method is the Slack approach: compare retained and churned orgs on counts like visits, active volunteers, and doors in week 1, then find the threshold where retention jumps. The `canvass_visits` append-only log (migration 0030) already has the data needed for this.
- Campaigns have a fixed end date (election day), so "habit" should be measured within a cycle, and retention should be counted as **re-activation in the next cycle**, not continuous monthly use.

### Gaps
- No public correlation-analysis case study with numbers for a B2B team product other than Slack (and Slack's is old). Facebook's "7 friends in 10 days" and Twitter's follow threshold are consumer examples and weren't sourced here.
- No time-to-value benchmarks from a primary 2024-26 source were found.

## Q4. When does PLG vs sales-led vs hybrid fit (ACV, buyer type)?

### Takeaway
Pure self-serve tends to stop working at about $1-5K ACV. From about $5K up to $50K ACV, hybrid "product-led sales" is the default. Product usage signals (PQLs) route accounts to people. Adding sales-assist roughly doubles freemium conversion in the Lenny/OpenView data.

### Cited Findings
- Freemium conversion with sales-assist is good at 5-7% and great at 10-15%, vs 3-5% and 6-8% for self-serve. — [Lenny's Newsletter (2023)](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion)
- PQL conversion rises with ACV: 30% at $1-5K ACV and 39% at $5-10K. The highest median free-to-paid conversion is at $1-5K ACV (10%). — [ProductLed (2022)](https://productled.com/blog/product-led-growth-benchmarks)
- The following come from secondary GTM blogs, not primary research, so they are low confidence:
  - "Pure PLG is a myth above $5K ACV"
  - Hybrid fits about $1K-$50K ACV
  - Self-serve typically caps at $1-5K
  - Sales-assisted deals should be about 3-5x the ACV of self-serve deals
  - Kyle Poyar is quoted on using usage data plus firmographic and LTV signals as PQL criteria for when sales should step in
  — [Monetizely](https://www.getmonetizely.com/articles/plg-vs-sales-led-which-go-to-market-strategy-fits-your-saas); [Cargo](https://www.getcargo.ai/blog/product-led-growth-meets-sales-led-growth); [Prospeo](https://prospeo.io/s/product-led-growth)

### Inferences
- Lynx probably sits at hybrid level for larger campaigns and parties (paid org plus fundraising, comms, and AI add-ons) and self-serve level for small local races and small advocacy groups. A reasonable design is:
  - Self-serve org creation for small orgs.
  - PQL-triggered human help when a usage signal fires, such as a voter file over X records, many active canvassers, or donations nearing the compliance threshold.
  - Sales-led for state parties and PACs.
- Today org creation is set to `pending_payment` and activated by a SuperAdmin. That's a manual sales gate, and it adds friction for small orgs that a self-serve payment processor would remove.

### Gaps
- No primary-source ACV thresholds from OpenView or Bessemer were fetched. The $5K and $50K cut-offs are folk wisdom repeated across blogs.

## Q5. AI-native SaaS growth patterns in 2025-2026: fast ARR growth but "AI tourist" churn

### Takeaway
AI-native companies grow far faster than classic SaaS: Bessemer's "Supernovas" average $40M ARR in year 1. But retention is much worse: median GRR is 40% for AI-native companies vs NRR of 82% for B2B SaaS (ChartMogul 2025). Retention improves sharply with price point, annual billing, and attachment to an existing budgeted workflow.

### Cited Findings
**Retention (ChartMogul and Growth Unhinged, 2025)**
- Dataset: about 3,500 companies (about 2,700 B2B SaaS, about 600 B2C, about 200 AI-native), each with at least $250K ARR.
- Medians:

  | Segment | GRR | NRR |
  |---|---|---|
  | B2B SaaS | not given | 82% (upper quartile 97%) |
  | B2C SaaS | not given | 49% |
  | AI-native | 40% | 48% |

- AI-native retention by price point:

  | Price point | GRR | NRR |
  |---|---|---|
  | More than $250/mo | 70% | 85% |
  | $50-249/mo | 45% | 61% |
  | Under $50/mo | 23% | 32% |

- AI-native median GRR rose from 27% in January 2025 to 40% in September 2025.
- At higher ARR stages, AI-native retention roughly doubles.
- Recommended fixes:
  - Target workflows that already have real budgets.
  - Use forward-deployed engineers.
  - Don't over-promise on initial engagements.
  - Speed up adoption.
  - Move to annual billing, which it documents as a 10-20 point NRR improvement.
- Quote: "AI tourists will move on to the next hot product."
— [Growth Unhinged, "The AI churn wave"](https://www.growthunhinged.com/p/the-ai-churn-wave); [ChartMogul SaaS Retention Report](https://chartmogul.com/reports/saas-retention-the-ai-churn-wave/)

**Growth speed**
- AI-native startups are about 3x more likely to reach $1M ARR in 6 months and about 8x more likely to reach $10M ARR in 12 months. This comes from a search summary of Poyar's work; the original post wasn't fetched. — [Growth Unhinged, "The odds of making it"](https://www.growthunhinged.com/p/the-odds-of-making-it)
- Bessemer State of AI 2025 (August 2025, 20 companies studied):

  | Archetype | Year-1 ARR | Year-2 ARR | Later ARR | Gross margin | ARR per FTE |
  |---|---|---|---|---|---|
  | Supernovas | about $40M | about $125M | reach $100M in about 1.5 years | about 25% | about $1.13M |
  | Shooting Stars | $3M | $12M | $40M in year 3, $103M in year 4 | about 60% | about $164K |

  Bessemer also proposes "Q2T3" (quadruple, quadruple, triple, triple, triple) in place of T2D3, and argues that the market will be shaped mostly by Shooting Stars with sturdier retention. — [Bessemer, State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025); [slides PDF](https://www.bvp.com/assets/uploads/2025/08/Final_PDF_State_of_AI_2025_slides_Bessemer_Venture_Partners.pdf)

### Inferences
- Lynx's `ai_module` is an org-scoped add-on sitting on top of a workflow product, not a standalone AI tool. ChartMogul's data suggests that is the more durable position: attached to a budgeted workflow (canvassing and fundraising) and priced at org level, well above the $50/mo bracket where AI GRR falls to 23%.
- The risk is AI add-on churn after the novelty wears off. Tie AI value to recurring workflow events (shift briefings, debriefs, donor asks) rather than one-off generation, and offer annual or per-cycle billing that matches election calendars.
- Political campaigns have built-in cyclical churn: they end on election day. Separate "cycle-end churn" from true dissatisfaction churn when benchmarking against SaaS GRR and NRR, and measure reactivation (an org or its staff returning next cycle) as the real retention metric.

### Gaps
- The "AI tourist" retention data covers AI-native companies, not AI add-ons inside existing SaaS. No benchmark was found for AI add-on attach rates or add-on churn.
- No 2026 update to the ChartMogul AI retention data was found.
