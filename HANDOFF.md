# RAG Chatbot — Handoff

Location: `rag_chatbot/` — **not git-tracked** (the parent folder is a git
repo for an unrelated project, Lynx; this directory has always been
untracked inside it, `git status` shows it as `??`). Nothing here has been
committed anywhere. Delivered to the owner as a zip three times so far,
most recently after the Vectorize/streaming round below.

## ⚡ Resume here

**Nothing in this app has ever been run against a real Claude API call.**
Every round was built and verified via mocked Claude responses (unit-level
control-flow tests) plus live checks of everything that doesn't need an
API key (retrieval pipeline, Streamlit UI shell, SQLite persistence layer,
the calculator's safety). No `ANTHROPIC_API_KEY` was available in the dev
environment at any point.

To actually use it:
```bash
cd rag_chatbot
pip install -r requirements.txt
cp .env.example .env        # paste in a real ANTHROPIC_API_KEY
python ingest.py            # builds index/ from documents/ (ships with 3 samples)
streamlit run app.py
```
Then run the specific test sequence in README.md's "What's verified vs.
not" section — it's written as an actual checklist (one doc, two docs,
follow-up, out-of-scope, math question), not just "try it out."

**Second thing to check:** the Vectorize.io integration. This session's
own Vectorize MCP connection returned `401: jwt malformed` on every call
(`retrieve` and `deep-research` both), a broken connector in this
environment that isn't fixable from the code side. The `vectorize_search`
tool was built against the real, installed `vectorize-client` SDK (0.4.0)
— its request/response schema was confirmed by installing the package and
introspecting `RetrieveDocumentsRequest`/`RetrieveDocumentsResponse`/
`Document` directly (the hosted docs pages didn't render for automated
fetching), so there's high confidence the integration is *correct*, but
the actual network round-trip has never been exercised. Fill in
`VECTORIZE_ORG_ID`/`VECTORIZE_API_KEY`/`VECTORIZE_PIPELINE_ID` in `.env`
and confirm a real query returns real results before trusting it further.

## What this is

Started as a straightforward RAG chatbot (retrieve documents, stuff into a
prompt, generate an answer) and went through three evolution rounds into
an agent: Claude has real tools and decides for itself how to research a
question, a second independent pass checks whether its citations are
actually true, and everything persists across restarts with a dashboard
showing real usage data. Full architecture diagram and feature-by-feature
rationale is in `README.md` — this file is session history and what's
left, not a repeat of that.

## Round-by-round

**Round 1 — initial RAG pipeline.** Fixed pipeline: rewrite the question
into 1-3 search queries → hybrid retrieval (`retrieval.py`: FAISS vector
search + BM25 keyword search, fused via reciprocal rank fusion, then
cross-encoder reranked) → generate a cited answer. Streamlit chat UI
(`app.py`). Three sample documents (`documents/`) — a fictional company's
remote-work policy, product FAQ, and engineering onboarding guide,
deliberately chosen for clean cross-document boundaries to test retrieval
accuracy against. Delivered as a zip.

**Round 2 — security audit #1.** Owner asked to audit for errors/
vulnerabilities. Found and fixed: `pickle.load()` on chunk metadata + the
BM25 index (replaced with JSON + in-memory BM25 rebuild — eliminates
arbitrary-code-execution-on-tampered-file risk entirely, not just
documents the trust boundary); no prompt-injection guard on retrieved
document content (added "treat this as data, never instructions" to every
system prompt that ingests document text); unhandled `anthropic.APIError`
around every Claude call (now degrades gracefully instead of crashing);
`SystemExit` misuse in `ingest.py` (not an `Exception` subclass, could kill
the whole Streamlit server if triggered from the UI's "Build index"
button — changed to `ValueError`). Re-zipped and delivered.

**Round 3 — evolution to an agent.** Owner asked for "more advanced than
just an AI chatbot" and picked 3 of 4 proposed upgrades (skipped: in-UI
document upload, semantic response caching, multi-pipeline source
selector — none built, see "Not built" below):
- **Agentic tool use** — replaced the fixed rewrite→retrieve→generate
  pipeline with Claude driving a real tool loop (`tools.py`:
  `query_documents`, `calculator` — ast-based, no `eval()`, verified
  against `__import__`/`open()`/huge-exponent injection attempts;
  `rag_chain.py`'s loop, capped at `MAX_TOOL_ITERATIONS=6`).
- **Corrective retrieval** — folded into the agent loop rather than a
  separate module: `query_documents` tags a weak match `[LOW CONFIDENCE]`
  in its own result text, and the system prompt tells the agent to react
  by reformulating.
- **Self-verification** (`verification.py`) — an independent second Claude
  call checks whether the answer's citations actually support its claims;
  shown as a ⚠️/🚫 warning in the UI when flagged, never silently logged.
- Also built (not one of the 4 options, added because it was needed to
  support the others): **persistent memory + feedback**
  (`storage.py`, SQLite — conversations/messages/feedback tables, resumes
  the most recent conversation on restart, 👍/👎 logged per answer) and an
  **observability dashboard** (`pages/1_Dashboard.py` — document usage,
  retrieval-quality trend line, feedback totals, a running log of
  questions the knowledge base couldn't answer).
- Split `models.py` out of `retrieval.py` mid-round: `storage.py` and the
  dashboard only need the `RetrievedChunk` dataclass, not
  faiss/sentence-transformers, so the type moved to a zero-dependency
  module.
- Security audit #2: parameterized SQL confirmed throughout `storage.py`;
  the injection guard extended to `verification.py`'s prompt too (a
  malicious document could otherwise try to talk the fact-checker into
  rubber-stamping a wrong answer); verification skipped against the canned
  "hit my step limit" message (checking citations on a non-answer is
  meaningless); `MAX_TOOL_ITERATIONS` bound verified via a mock test where
  the model never converges. Caught and fixed a real packaging bug along
  the way: PowerShell's `Compress-Archive` corrupted an emoji in the
  dashboard's filename (`1_📊_Dashboard.py`), fixed by renaming to
  `1_Dashboard.py` (emoji stays in the page's title/icon, just not the
  filename) rather than fighting the zip encoding.

**Round 4 — Vectorize.io + streaming.** Owner asked to "vectorize it too"
— genuinely ambiguous at first (vector search already existed locally)
until noticing `mcp__vectorize__*` tools were connected to the session,
which resolved it: a second, externally-hosted knowledge base, not a
restatement of existing local vector search.
- Probed the live Vectorize MCP connection first — both `retrieve` and
  `deep-research` failed with `401: jwt malformed` (see "Resume here").
- Researched the real API via `vectorize-client` on PyPI (0.4.0) since the
  hosted docs pages returned empty content to automated fetching;
  installed it and introspected `PipelinesApi.retrieve_documents`,
  `RetrieveDocumentsRequest`, `RetrieveDocumentsResponse`, and `Document`'s
  actual fields directly rather than guess from partial doc excerpts.
  `vectorize_search` tool added to `tools.py`, dispatched in
  `rag_chain.py` alongside the existing tools, fully optional (absent from
  `TOOLS` entirely when the three `VECTORIZE_*` env vars aren't all set,
  not offered-then-erroring).
- Streaming: `rag_chain.answer_question_stream()` is now a generator
  (`client.messages.stream()` + `.text_stream` + `.get_final_message()`,
  verified against the actual installed `anthropic` SDK's
  `MessageStream` class source before relying on it) yielding
  `turn_start`/`tool_call`/`tool_result`/`text_delta`/`done` events so
  `app.py` can show live tool-call progress and stream the final answer
  token-by-token, with zero Streamlit-specific code in `rag_chain.py`
  itself. `answer_question()` kept as a thin wrapper draining the
  generator, for tests/simple callers.
- Every existing mock scenario (normal tool use, iteration-limit
  exhaustion, calculator) was re-run against the new streaming
  architecture, not assumed to still work — all passed. Added a new
  `vectorize_search` dispatch test and a realistic multi-turn streaming
  test (leading reasoning text in a tool-call turn, separately-streamed
  final answer).
- Security audit #3: `run_vectorize_search`'s `except Exception` (broader
  than the `anthropic.APIError` used elsewhere) documented as deliberate
  — a third-party SDK boundary that must never crash the agent loop, not
  sloppy error handling; Vectorize citations namespaced
  (`vectorize:<source>`) so they can never collide with local-document
  citations.

**Round 5 — on/off toggle + three more advanced-RAG techniques.** Owner
asked to keep adding RAG technology and to add a way to turn the chatbot
on/off.
- **On/off toggle** (`storage.py`'s new `settings` key/value table +
  `get_setting`/`set_setting`; `app.py`'s new sidebar "Availability"
  section) — SQLite-backed like conversation history, so it survives a
  restart, not just a browser tab. Off disables `st.chat_input` (verified
  the underlying `<textarea disabled>` DOM attribute, not just the
  placeholder text) and shows a visible warning; existing history and the
  Dashboard stay visible either way.
- **Contextual Retrieval** (Anthropic's own published technique) —
  `ingest.py`'s new `generate_chunk_context()` asks a cheap/fast model
  (`CONTEXT_MODEL`, default `claude-haiku-4-5-20251001`) to write a short
  blurb situating each chunk within its whole document (prompt-cached on
  the document so contextualizing every chunk of one file re-billing only
  the first read), then indexes `context + chunk` instead of the bare
  chunk. `models.py`'s new `chunk_index_text()` is the one shared place
  that decides what text gets embedded/BM25'd/reranked (`retrieval.py`
  now calls it in three places instead of reading `record["text"]`
  directly) — citation/display always still reads the original
  `record["text"]`, never the generated context, so a user-facing excerpt
  is always real document text. Degrades gracefully exactly like
  ingest.py always has: no `ANTHROPIC_API_KEY` at ingest time just skips
  context generation with a printed note (verified live — re-ran
  `python ingest.py` with no key after this change, same clean 10-chunk
  index as before, no error).
- **Multi-query expansion** (`tools.py`'s new `_expand_query()` +
  `retrieval.py`'s new `HybridRetriever.retrieve_multi()`) — an opt-in
  (`ADVANCED_QUERY_EXPANSION=false` by default, since it's an extra Claude
  call before every search) query-rewriting step: ask a cheap/fast model
  for 2 alternate phrasings, search all 3, fuse the candidate pools via
  the existing RRF `_fuse()` (generalized from exactly-two lists to
  `*hit_lists` so this could reuse it), then rerank strictly against the
  ORIGINAL question, never a rewrite — a rewrite only gets to widen what's
  considered, not what counts as relevant. `rag_chain.py` now passes its
  `client` through `run_query_documents()` so this has something to call.
- **Relevance floor** (`retrieval.py`'s `MIN_RERANK_SCORE`, default -6.0,
  extracted the shared rerank+finalize logic into
  `_rerank_and_finalize()` so both `retrieve()` and `retrieve_multi()` get
  it) — a reranked chunk below the floor is dropped from the result set
  entirely instead of padding in weak matches just to fill `top_k`.
  Distinct from `tools.py`'s pre-existing `CONFIDENCE_THRESHOLD`, which
  only decides whether to annotate returned chunks as low-confidence, not
  whether to return them at all.
- Verified live, without needing an API key (same "everything that
  doesn't need Claude" boundary as every prior round): a standalone script
  exercising the rebuilt `HybridRetriever` directly — `retrieve()` still
  returns sensibly-ranked, on-topic results; a nonsense query now returns
  **zero** results instead of being padded to `top_k` with garbage (the
  floor working); `retrieve_multi()` with 3 differently-worded PTO/vacation
  queries surfaces the right chunk; and single-item `retrieve_multi()`
  produces output identical to `retrieve()` (no regression in the
  unexpanded path). Also launched the real Streamlit app (added a
  `rag-chatbot` launch.json config alongside Lynx's own `lynx-dev` one,
  using `python -m streamlit run <full path>` since a plain `streamlit`
  command isn't on this box's PATH and `cmd /c` badly mangles a quoted
  path containing a space — `Lynx Stuff` — no matter how it's quoted;
  PowerShell's own tokenizer via `& '<path>'` sidesteps that) and drove it
  through the Browser preview tool: sidebar's new "Availability" toggle
  renders correctly bound to the persisted setting; flipping
  `chatbot_enabled` to false via `storage.set_setting()` (the automation
  tool's synthetic clicks couldn't complete a press gesture on the
  toggle's react-aria "switch" component — a browser-automation friction
  point, not an app bug, confirmed by inspecting the DOM: `data-hovered`
  updated on click but `data-selected`/`checked` never flipped) and
  reloading showed the warning banner and a genuinely `disabled` chat
  input textarea; flipping back to true restored the normal state. Not
  live-verified (same reason as every previous round): real context
  generation and real multi-query expansion output, since both need
  `ANTHROPIC_API_KEY`.

**Round 6 — three more advanced-RAG techniques, all local/no-extra-API-call
by design.** Owner asked to keep going, specifically framed around making
answers more *accurate*. Round 5 leaned on cheap Claude calls
(contextualization, query expansion); this round deliberately leans the
other way -- pure Python/numpy running on the embedding model already
loaded for retrieval, so none of it costs an extra API call or depends on
having a key at all.
- **Sentence-window retrieval** (`retrieval.py`'s new
  `neighbor_window_text()`, a `_by_source_index` lookup built in
  `__init__`) — chunks stay small for retrieval precision, but the text
  actually sent to the model for a retrieved chunk is expanded to include
  its immediate physical neighbors (same source, adjacent `chunk_index`),
  so information split across a chunk boundary at ingest time isn't lost
  at generation time. `tools.py`'s `run_query_documents` now builds its
  model-facing body from this expanded window instead of the bare
  `c.text` — the citation (`c.source#c.chunk_index`) still points at
  exactly the chunk that matched, never the window. `NEIGHBOR_WINDOW=0`
  disables it (falls back to exactly the old behavior, verified: window=0
  produces text identical to the bare chunk). Vectorize-sourced chunks
  fall back to their own text unchanged since there's no local adjacency
  to look up for an externally-hosted pipeline's results.
- **MMR (Maximal Marginal Relevance) diversity selection**
  (`retrieval.py`'s new `_mmr_select()`, wired into `_rerank_and_finalize`
  between the relevance floor and the final top_k slice) — greedily picks
  each result trading off relevance (the reranker's own score, reused
  rather than re-embedding the query separately) against redundancy
  (cosine similarity to already-picked results), so top_k isn't spent on
  several chunks all making the same point. `USE_MMR=false` restores the
  old plain-top-k-by-score behavior exactly (verified: with ≤ top_k
  eligible candidates MMR and plain selection are identical by
  construction, since there's nothing to trade off).
- **Embedding-based sentence-level groundedness check** (new
  `groundedness.py`) — after the agent produces a cited answer, splits it
  into sentences and flags any whose best cosine similarity against the
  cited chunks' own text falls below `GROUNDEDNESS_THRESHOLD`, using the
  SAME embedding model already loaded for retrieval. A free, local,
  deterministic *complement* to `verification.py`'s LLM-based holistic
  verdict, not a replacement — it points at the specific sentence,
  verification.py gives one verdict for the whole answer. Skips sentences
  that are honest meta-statements ("the documents don't cover this") using
  the same hedge-phrase family `storage.py`'s `unanswerable_questions()`
  already matches on, kept in sync deliberately so an honest "I don't
  know" is never mistaken for a hallucination. Wired end-to-end:
  `rag_chain.py`'s `RagAnswer.groundedness`, a migration-safe new
  `groundedness_json` column in `storage.py` (`ALTER TABLE ... ADD COLUMN`
  wrapped in a caught `OperationalError`, verified against the real,
  already-populated `chat_history.db` this session created in Round 5 —
  confirmed the column gets added and round-trips correctly on an
  existing database, not just a fresh one), and a soft (not alarm-red)
  expander in `app.py` next to the verification warning, explicitly
  labeled as a heuristic rather than a verdict.
- Verified live, all without an API key (same boundary as every prior
  round, but this round's features don't strictly need one at all): a
  standalone script confirmed `neighbor_window_text()` roughly doubles the
  text length for a real chunk with real neighbors and degrades to exactly
  the bare chunk at `window=0`; MMR wiring doesn't break normal
  `retrieve()` and matches plain top-k when there's nothing to trade off;
  and `check_groundedness()` correctly flagged a fabricated "the company
  provides a free luxury car" sentence while leaving both a faithful
  paraphrase of a real stipend fact and an honest hedge-only answer
  unflagged. One transient `httpx.ReadError` hit reaching the Hugging Face
  Hub for a routine metadata check during this verification (unrelated to
  any code change, model weights were already cached locally from earlier
  rounds) — resolved by re-running with `HF_HUB_OFFLINE=1`, not a real
  issue. Not separately live-verified: whether MMR actually changes
  selection on a real query (this 10-chunk, 3-document demo corpus rarely
  has near-duplicate chunks to trade off against each other — the logic
  was verified correct, just not exercised on a case where it changes the
  outcome).

**Round 7 — five more AI features, all Python-orchestrated.** Owner asked
for 5 more Python-based AI features for the chatbot. Unlike Round 6 (local/
no-API-call by design), these five each add a genuinely new capability on
top of the existing pipeline, most via a cheap/fast model call
(`claude-haiku-4-5-20251001`, same choice as every prior round's auxiliary
calls) -- new modules `semantic_cache.py`, `intent.py`, `followups.py`,
`memory.py`, plus document summaries added to `ingest.py`.
- **Semantic response caching** (`semantic_cache.py`) — before running the
  full pipeline, embed the question (reusing the retrieval embedder, so a
  lookup is a local operation, not a Claude call) and compare against every
  previously-cached question; above `SEMANTIC_CACHE_THRESHOLD` reuse that
  prior answer verbatim, skipping retrieval/generation/verification/
  groundedness/follow-ups entirely. **The threshold was recalibrated from
  measured data mid-round, not left at a guess**: the first version shipped
  with 0.95 and a docstring claiming it would catch paraphrases like
  "what's the wifi stipend" vs "how much is the internet stipend" -- the
  live smoke test caught this as wrong (that exact pair only scored 0.845).
  A follow-up calibration script measured 5 real paraphrase pairs and 3
  unrelated pairs: unrelated topped out at 0.2524, genuine paraphrases
  using different vocabulary scored as low as 0.23 (LOWER than some
  unrelated pairs -- no safe threshold catches those without false
  positives), and only near-duplicate re-askings (typo, capitalization,
  punctuation, minor rewording keeping the same words) reliably scored
  0.94-0.99. Landed on **0.90** -- comfortably above every non-duplicate
  score measured (max 0.79), comfortably below the near-duplicate floor
  (min 0.94). The docstring, `.env.example`, and the smoke test were all
  corrected to describe what this actually does (catches re-askings, not
  loose paraphrases) instead of the original overclaim. `ingest.py` clears
  the whole cache on reindex (`storage.clear_response_cache()`) since a
  cached answer is tied to a document snapshot. Dashboard now shows cached-
  answer count and hit count.
- **Query intent routing** (`intent.py`) — one cheap classification call up
  front on every message routes chitchat/meta ("hi", "what can you do?")
  to a short direct reply with zero retrieval, skipping a
  `query_documents` call that would just come back empty. Fails closed
  toward "knowledge" (the real pipeline) on any classification error --
  an unnecessary retrieval on a greeting is harmless, silently skipping
  retrieval for a real question is not.
- **AI document summaries** (`ingest.py`'s `generate_document_summary()`,
  new `index/document_summaries.json`) — one cheap call per DOCUMENT (not
  per chunk -- far fewer calls than Contextual Retrieval), shown in
  `app.py`'s sidebar under each filename. Shares one `anthropic.Anthropic`
  client with Contextual Retrieval's chunk-level calls rather than
  instantiating a second one. Same graceful no-key-skip pattern (always
  writes the file, empty `{}` when skipped, so a reindex without a key
  doesn't leave a stale summary describing a document that changed).
- **Follow-up question suggestions** (`followups.py`) — after a grounded
  (non-cached, non-chitchat) answer, one cheap call suggests 2-3 follow-up
  questions grounded in the same retrieved sources, rendered as clickable
  chips (`app.py`'s `_render_followups`). Clicking one stages it in
  `st.session_state.pending_question` and reruns; the main loop picks that
  up exactly like a typed `chat_input` submission, so a suggested
  follow-up is indistinguishable from one the user typed themselves once
  submitted. Persisted via a new `follow_ups_json` column
  (migration-safe, same `ALTER TABLE` + caught `OperationalError` pattern
  as `groundedness_json` in Round 6) and replayed on a cache hit too (the
  cache entry stores its own follow-ups).
- **Conversation memory summarization** (`memory.py`) — `HISTORY_WINDOW`
  (10 turns) has always hard-truncated older messages out of the agent's
  context; this generates a short summary of exactly the turns about to
  fall out and folds it into the SYSTEM prompt for that turn (deliberately
  NOT the message list, which risks breaking the Messages API's
  user/assistant role alternation). Regenerated from scratch each time the
  window is newly exceeded rather than incrementally merged -- simpler and
  correct, costs a little redundant work on a very long conversation.
  New `conversations.summary` column, migration-safe.
- **A real naming collision caught and fixed mid-round**: the tool-loop's
  existing local variable `summary` (the short "N result(s)" status text
  for `tool_result` events) collided with the new conversation-summary
  variable of the same name introduced in the same function. Not a
  runtime bug (the tool-loop one is reassigned after the conversation
  summary is already baked into `system_for_turn`), but a real clarity
  hazard caught during review and fixed by renaming the tool-loop one to
  `tool_summary` before it could confuse a future reader.
- Verified live, all without needing an API key except where the whole
  point is a Claude call (marked below): storage.py's three new/changed
  tables (`response_cache`, `conversations.summary`,
  `messages.follow_ups_json`) all confirmed against the real, already-
  populated `chat_history.db` from earlier rounds, not just a fresh DB;
  the full semantic-cache calibration described above, re-run after the
  fix to confirm the corrected threshold produces a real hit on a
  near-duplicate, a real miss on an unrelated question, AND a real miss on
  a loose paraphrase (proving the documented limitation is real, not
  theoretical); each of `intent.py`/`memory.py`/`followups.py`'s API-
  failure fallback paths, exercised against a fake client that raises a
  REAL `anthropic.APIConnectionError` (not a generic exception) to match
  what a network blip or bad key actually raises; `ingest.py` re-run with
  no key confirms document summaries skip gracefully (writes `{}`) exactly
  like Contextual Retrieval already did, and confirms the reindex-clears-
  cache behavior fires; and a full live Streamlit session through the
  Browser preview tool confirmed the whole app (all 5 new modules wired
  through `rag_chain.py` and `app.py`) loads and renders with zero
  exceptions -- sidebar, toggle, chat input, everything. That last check
  needed real patience: cold-loading this much heavier import graph (4 new
  modules each importing `anthropic`, on top of the existing
  faiss/torch/sentence-transformers stack) took over 3 minutes in this
  sandboxed environment; confirmed via Windows `tasklist` that the Python
  process's CPU time and memory were both climbing the whole time (not
  hung, just genuinely slow here) before concluding it would finish rather
  than assuming a bug. Also fixed the `rag-chatbot` launch.json entry to
  set `HF_HUB_OFFLINE=1` -- without it, this environment's flaky path to
  the Hugging Face Hub metadata endpoint (the same `ConnectionResetError`/
  `httpx.ReadError` hit standalone in Round 6) could stall a cold Streamlit
  launch specifically, since none of the module-loading scripts run via
  Bash in this round had that flakiness (they all set the env var
  themselves). Not live-verified: real intent classification, real
  chitchat replies, real follow-up suggestions, real document summaries,
  and real conversation-memory summaries -- all five need
  `ANTHROPIC_API_KEY`, which still isn't set in this environment.

**Round 8 — retrieval that adapts to what's actually being asked.** Owner
asked for better information retrieval based on what the user is asking
or wanting, in Python. Two additions, both aimed specifically at that
framing (not more general retrieval-quality tuning like Round 6):
- **Conversational query rewriting** (`query_rewrite.py`) — a query that
  looks context-dependent (short, or containing a reference word like
  "it"/"that"/"the other one" from a fixed list) gets rewritten into a
  self-contained search query using recent conversation history, via one
  cheap call, BEFORE it's ever searched. A local regex gate
  (`_looks_context_dependent`) means a clearly self-contained query never
  pays for the extra call. Distinct from `tools.py`'s existing multi-query
  expansion, which paraphrases an already-CLEAR query several ways to
  widen the candidate pool -- this instead fixes an UNCLEAR one before a
  single search runs. The agent already sees full conversation history
  when it decides how to phrase a `query_documents` call, so it often
  gets this right on its own already -- this is a deterministic safety
  net for when it doesn't, not the only thing standing between a vague
  follow-up and a real answer. `tools.py`'s `run_query_documents` now
  returns the EFFECTIVE (possibly rewritten) query as a third return
  value, and `rag_chain.py` records that in `queries_used` instead of the
  agent's literal tool-call argument -- more useful for the sidebar's
  "searches the agent ran" caption and the Dashboard's unanswerable-
  questions log, since it shows what was actually searched.
- **Query-adaptive hybrid fusion weighting** (`models.query_fusion_weights`,
  wired into `retrieval.py`'s `_fuse`/`retrieve`/`retrieve_multi`) — RRF
  fusion used to weight vector and keyword hit lists equally for every
  query. A query containing a quoted phrase, a dollar amount, a
  percentage, or a bare multi-digit number signals it wants a specific,
  literal fact -- exactly what keyword search is good at and embedding
  similarity is comparatively weak at (a $40 stipend and a $400 stipend
  embed as nearly identical vectors). That kind of query now gets
  keyword search's contribution to the fused ranking boosted
  (`EXACT_SIGNAL_KEYWORD_BOOST`, default 1.6x); a conceptual query still
  fuses at equal weight, byte-for-byte identical to the behavior before
  this feature existed. Pure regex, no extra API call, runs locally on
  every query. `_fuse()` was generalized from unweighted hit lists to
  `(hits, weight)` pairs to support this -- weight 1.0 everywhere
  reproduces the exact prior behavior, which is how both `retrieve()` and
  `retrieve_multi()`'s existing tests kept passing unchanged.
- Verified live, all without needing an API key except the rewrite call
  itself (marked below): `query_fusion_weights` against 5 real query
  pairs (3 exact-fact signals correctly boosted, 2 conceptual queries
  correctly left at equal weight); `_looks_context_dependent`'s gate
  against 4 real queries (correctly triggers on short/pronoun-bearing
  ones, correctly skips a long self-contained one); `rewrite_query` with
  no history returns the query unchanged (nothing to resolve against);
  `rewrite_query` against a fake client that raises a REAL
  `anthropic.APIConnectionError` (matching Round 7's established pattern
  for these fallback tests) falls back to the original query rather than
  raising; and a real `retrieve()` call with adaptive weighting enabled
  still returns sensible, correctly-ranked results end-to-end (no
  regression in the base retrieval path). `python ingest.py` re-run
  clean with no key, confirming neither new module broke ingestion
  (neither actually touches it -- both are query-time-only -- but this
  reconfirms the whole app still imports and runs cleanly end to end).
  Not live-verified: a real rewritten query's actual text content (e.g.
  confirming "how much is it?" really becomes "how much is the internet
  stipend?" against real conversation history) -- the fallback path and
  the gating heuristic were verified, but the rewrite MODEL CALL itself
  needs `ANTHROPIC_API_KEY`, still not set in this environment.

**Round 9 — campaign fundraising demo pivot.** Owner pasted a large,
sprawling list of ~20 political-campaign fundraising/advocacy feature
names (compliance guardrails, donor stewardship, dark-money research,
multi-channel bots, ask personalization, concrete messaging, win-back
sequences, impact reporting, lead qualification, etc.) and asked for them
in "this Python-based RAG chatbot." **Before writing any code**, two
things were flagged and clarified via AskUserQuestion: (1) three items
were already built (Self-Correction = Round 3's corrective retrieval;
Multi-Query Expansion = Round 5; Post-Generation Validation/Self-RAG =
`verification.py` + `groundedness.py`); (2) almost everything else is
political-campaign domain content that this generic 3-document demo had
no data for at all, and duplicates most of what already exists, built
for real, in **Lynx** (the actual campaign platform this session's
parent folder also contains) -- Contribution Limit Guardian, donor
retention/reactivation, Ask Optimizer, Compete tab, etc. Owner confirmed:
build it in `rag_chatbot` anyway (a deliberate pivot/demo, not a
misunderstanding), and make every donation/payment/multi-channel-send
feature **drafting-only** -- AI generates text/amounts, a human sends
through a real channel, nothing here ever charges a real payment or
sends a real message. This app still has zero payment or messaging
integration of any kind.

Given the size, the ~20 items were explicitly consolidated (stated back
to the owner before building) rather than built as 20 independent
systems:
- **Gratitude-Driven Stewardship, "Softer" Voluntary Appeal Buttons,
  Politeness-Enabled Emotional Intelligence, Low-Level Construal
  (Concrete) Messaging** all became SYSTEM PROMPT / tone rules applied to
  every donor-facing draft (`rag_chain.AGENT_SYSTEM` rule 7,
  `stewardship._TONE_GUARDRAILS`), not four separate modules.
- **Autonomous Donor Stewardship & Reactivation, Automated "Fast-Action"
  Re-Engagement, Conversational Impact Reporting, AI-Driven Revenue
  Optimization** collapsed into one `stewardship.py` purpose group (they
  overlap almost entirely: all four are "personalized donor-facing
  message, generated from real giving history").
- **Real-Time Lead Qualification and Multi-Channel Reach**'s multi-
  platform half (WhatsApp, Facebook Messenger) is explicitly OUT OF
  SCOPE regardless of the drafting-only decision -- reaching a real
  platform needs real Meta/WhatsApp Business API credentials and account
  setup, not a code change. Only the SCORING half was built.
- **Advanced Tactical "Agentic" Fundraising** and **Interactive
  Conversation-to-Donation Interface** are the same mechanism from two
  ends (a tool the agent decides to call + the UI that renders what it
  returns) and were built together as one feature.

New foundation (`campaign_data.py`): 9 entirely fictional mock
donors/prospects covering every pattern the features below need --
active, lapsed (recently and long-lapsed), a brand-new prospect with
zero donations, a donor near the fictional $3,300 contribution limit,
and two donors sharing a fictional employer (for the affiliated-cluster
check). Static Python data by design, matching how `documents/` already
ships static sample content rather than needing a document-upload flow
-- a real deployment would swap this module for an actual donor
database/CRM integration behind the same function signatures
(`get_donor`, `all_donors`, `lapsed_donors`). Three new indexed documents
(`campaign_contribution_limits.txt`, `campaign_impact_stats.txt`,
`opponent_public_record.txt`) plus a fourth for the staff-copilot item
(`campaign_field_ops_overview.txt`) -- all explicitly labeled fictional
example content, kept thematically separate from the original Aurora
Robotics workplace-policy corpus (which stays untouched, still serving
its original retrieval-accuracy regression-test purpose).

- **Real-Time Compliance & Contribution Limit Guardrails**
  (`compliance_guardrail.py`) -- a pure-Python running-total check
  against a STAFF-CONFIGURABLE threshold (never an AI guess, zero AI
  calls at all, the same discipline as Lynx's own Contribution Limit
  Guardian and this codebase's Compliance-stays-AI-free precedent from
  earlier rounds). Flags a proposed donation that would exceed the
  limit and an informal shared-employer donor cluster approaching it
  together -- always advisory, never a legal determination, with the
  same amber "not legal advice" banner pattern as
  `campaign_contribution_limits.txt`'s own disclaimer. Surfaced in a new
  Dashboard section.
- **Predictive "Optimal Ask" Personalization + Low-Level Construal
  Messaging** (`ask_personalization.py`) -- a DETERMINISTIC heuristic
  (not an AI guess) on a donor's real giving history: a lapsed donor
  gets suggested LESS than their last gift (explicitly requested, to
  lower reactivation friction), an active donor gets somewhat more than
  their recent average, a first-time prospect gets a modest default --
  and the suggestion is capped at the donor's real remaining
  compliance-limit capacity (`compliance_guardrail`), so a personalized
  ask can never recommend more than the donor could actually give.
  `concrete_impact_phrase()` converts any dollar amount into a specific,
  literal description of what it funds (the exact "$50 = 500 text
  messages" example from the request, verified to compute exactly that
  since $1 = 10 texts in `campaign_impact_stats.txt`), tiered up to
  larger concrete units (canvassing shifts, ad spots) for bigger amounts.
- **Interactive Conversation-to-Donation Interface + Advanced Tactical
  Agentic Fundraising** (`fundraising_tools.py`, wired into
  `rag_chain.py`) -- a new `draft_donation_ask` tool the agent can call
  mid-conversation, gated in both the tool description AND the system
  prompt to ONLY fire when the user has clearly expressed donation
  interest, never pushed unprompted. Personalizes via
  `ask_personalization.py` for whichever donor/prospect is selected in
  a new sidebar "Simulated logged-in donor/prospect" dropdown
  (`app.py`) -- standing in for real account authentication, which this
  demo doesn't have. The UI renders the suggestion as clickable amount
  chips (`_render_donation_ask`); clicking one shows an explicit "demo
  mode, no real payment processed" message rather than doing anything.
  An answer that used this tool is deliberately excluded from the
  semantic cache (`rag_chain.py`) -- a suggestion tied to one donor's
  live giving/compliance state must never be replayed for a different
  donor asking a similar-sounding question later.
- **Donor Stewardship AI purpose group** (`stewardship.py`, a new
  `pages/2_Donor_Stewardship.py` STAFF page -- deliberately not the
  donor-facing chat) -- `draft_reactivation_message` (lapsed donors
  only), `draft_winback_sequence` (a JSON-structured 3-4 touch,
  alternating-channel sequence over 2-3 weeks, matching the request's
  own spec), and `draft_impact_report` (a personalized "here's what your
  gift did" follow-up ending in a soft, non-coercive nudge toward a
  recurring gift). All three reuse the SAME quality-tier model as the
  main agent (`ANTHROPIC_MODEL`, not the cheap/fast Haiku default used
  for internal checks elsewhere in this codebase) since this is final
  donor-facing copy, not an internal check.
- **Competitive Intelligence RAG** (`competitive_intel.py`, new
  `pages/3_Compete.py`) -- built on the SAME retrieval pipeline as
  everything else, scoped to the real, already-indexed
  `opponent_public_record.txt` (also normally retrievable through the
  regular chat -- a user can just ask about the fictional opponent's
  voting record and get a grounded, cited answer like any other
  document). Two drafting purposes on top of that:
  `draft_contrast_message` (accurately summarizes the opponent's real
  record, leaves a bracketed placeholder for OUR position rather than
  inventing one) and `draft_rebuttal` (truth-sandwich structure: real
  fact, correct the record, restate our position). Mirrors Lynx's own
  Compete-tab ethics: public records only, issues only, never personal
  traits/family/private life, never extend a quote, no scraping or
  automated monitoring -- the only source is the hand-curated document.
- **Multilingual response support** (`multilingual.py`, wired into
  `tools.py`'s `run_query_documents` chained after query rewriting) --
  translates a non-English query to English before retrieval, since the
  indexed documents (and BM25 index) are English and an un-translated
  query would retrieve poorly against them. Response GENERATION is
  deliberately left to the main agent (system prompt rule 8: answer in
  the user's own language, keep citation tags unchanged) rather than a
  bolt-on post-hoc translation pass -- avoids three lossy hops (translate
  question -> generate in English -> translate answer back) in favor of
  one. A cheap local ASCII-only gate skips the translation call entirely
  for genuinely English text.
- **Real-Time Lead Qualification** (`lead_qualification.py`, new
  Dashboard section) -- a transparent, explainable, zero-AI-call
  heuristic score on real conversation signals (donation keywords,
  sustained multi-question engagement), not a black-box model verdict.
  New `storage.all_conversation_ids()` lets the Dashboard iterate every
  conversation to score it. The multi-platform-reach half of the
  original ask is out of scope, as noted above.
- **Autonomous Advocacy & Multi-Channel Engagement**
  (`channel_variants.py`, a 4th tab on the Donor Stewardship page) --
  reformats one core message for each channel's real format constraints
  (email needs a subject line, SMS has a hard character limit, a social
  post must stand alone with no prior context) rather than just
  truncating the same text three ways. Content generation only -- no
  email/SMS/social-platform integration exists in this app.
- **Advanced Campaign Staff Copilot** -- realized by simply adding
  `campaign_field_ops_overview.txt` (canvassing shifts, door-script
  order, data-entry rules, volunteer safety, onboarding) to the indexed
  corpus: the SAME chatbot that answers donor questions now also answers
  real staff-ops questions, since "staff copilot" was never a separate
  mechanism from "RAG chatbot with the right documents indexed."
- Verified live, all without needing an API key except where a Claude
  call is the entire point (marked below): `campaign_data.py`'s mock
  donor logic against every pattern (lapsed/active/prospect/near-limit
  correctly identified); `compliance_guardrail.py`'s limit check (a
  near-limit donor correctly flagged `would_exceed`) and employer-cluster
  flag (Foster & Whitfield LLP's real $2,700 combined correctly flagged
  against the real $3,300*0.8=$2,640 threshold); `ask_personalization.py`
  across every donor pattern, including confirming the compliance-cap
  integration actually reduces a raw $2,000 suggestion down to a real
  $100 remaining-capacity cap for a near-limit donor; `fundraising_tools
  .run_draft_donation_ask` for a lapsed donor, a general visitor, and a
  capped donor; `stewardship.py`'s three functions' API-failure fallback
  paths against a fake client raising a REAL `anthropic
  .APIConnectionError` (matching the established Round 7/8 pattern), plus
  confirming `draft_reactivation_message` short-circuits BEFORE any API
  call for a non-lapsed donor and `draft_impact_report` does the same for
  a donor with no donations; `competitive_intel._opponent_excerpts`
  against the real rebuilt index (correctly returns only
  `opponent_public_record.txt`-sourced chunks for a real query);
  `channel_variants.draft_channel_variants`'s fallback path;
  `multilingual.py`'s ASCII-only local gate (correctly triggers on
  Spanish/Chinese text, correctly skips English) and its API-failure
  fallback; `lead_qualification.score_conversation` against a hand-built
  high-intent transcript (donation keyword + 3 questions -> score 75,
  "high") and a low-intent one (a bare "hi" -> score 0, "low"); a full
  re-ingest picking up all 4 new documents cleanly (24 chunks across 7
  documents, same graceful no-key-skip behavior as every prior round);
  and a full live Streamlit session through the Browser preview tool
  confirming the ENTIRE app -- main chat with the new donor-selector
  sidebar, Dashboard (now with Compliance and Lead Qualification
  sections), and the two brand-new pages (Donor Stewardship, Compete) --
  loads and navigates with zero real exceptions (only the known-harmless
  `torchvision`/Streamlit-file-watcher cosmetic traceback, unrelated to
  this session's code, already documented in Round 6/7). The donor
  selector was driven end-to-end: typed a filter ("Sam"), selected "Sam
  Whitfield (active)" from the resulting dropdown, and confirmed via
  direct DOM inspection that the selection actually stuck. **Not**
  live-verified: real output from any of the six Claude-backed Round 9
  features (donation-ask phrasing, reactivation/win-back/impact-report
  drafts, contrast/rebuttal drafts, channel variants, real translation
  content) -- all six need `ANTHROPIC_API_KEY`, still not set in this
  environment; and clicking an actual amount chip / generating an actual
  stewardship or compete draft through the live UI (the mechanics were
  verified at the function level, not through a live button click,
  since every one of those needs a real API call to produce anything to
  click through to).

**Post-Round-9 update: the owner added a real `ANTHROPIC_API_KEY`.**
Re-ran `python ingest.py` with it -- Contextual Retrieval and document
summaries, previously only structurally verified, generated real content
for the first time: all 24 chunks got real situating-context blurbs (one
spot-checked example: a `campaign_impact_stats.txt` chunk got "This is
the introductory section of a campaign field program cost reference
guide that establishes the document's purpose..."), and all 7 documents
got accurate one-sentence summaries (e.g. `remote_work_policy.txt` →
"Aurora Robotics remote work eligibility, paid time off, sick leave,
stipends, and expense reimbursement policies" -- genuinely correct).
Then drove two real end-to-end features live in the browser: asking "How
much is the remote work internet stipend?" in the main chat produced a
real, correctly-cited answer ($40/month, `remote_work_policy.txt#2`),
plus real, on-topic follow-up suggestions, with no verification/
groundedness warnings (passed both checks cleanly); and generating a
real reactivation message for Marcus Webb (a real lapsed mock donor) on
the Donor Stewardship page produced a genuinely well-crafted draft that
correctly used his real last-gift amount ($100), the real computed
$60 suggested ask (100 * 0.6 lapsed-reactivation ratio), and the exact
real concrete-impact phrase for $60 ("one full hour of relational-
organizing phone banking") -- confirming `ask_personalization.py`'s
math, `compliance_guardrail`'s non-interference (no cap triggered, since
he's nowhere near the limit), and the tone guardrails (gratitude-first,
zero pressure, no invented urgency) all worked together correctly in one
real generation. The remaining four of six Round 9 Claude-backed
features (win-back sequences, impact reports, Compete drafts, channel
variants, real non-English translation) are still only structurally
verified, not exercised with real output.

**Round 10 — embeddable floating chat widget.** Owner: "I need the
chatbot to hover on the right side of the platform and easy to add to
any platform. I don't want it to be a full window chatbot." Streamlit
cannot do this -- it only ever renders as its own full page, with no
API for behaving as a small corner overlay on someone else's site. The
only architecturally sound way to get "hover in a corner, one-line embed
on any platform" is what every real embeddable chat widget (Intercom,
Drift, Crisp, etc.) actually does under the hood: a tiny, dependency-free
JS shell that any host page loads via a single `<script>` tag, which
renders a floating bubble button and, on click, lazily opens an
`<iframe>` pointing at the real chat app. **This is the only non-Python
file in the whole project, and unavoidably so** -- "runs inside a third-
party website's own page" means it has to be what that page's browser
tab executes, which is HTML/JS/CSS regardless of what language the
actual chatbot is written in. The chatbot itself -- every AI/RAG feature
-- remains 100% unchanged, 100% Python, running exactly as it already
was; the widget adds zero new Python code and doesn't touch the agent,
retrieval, or any AI purpose.
- `widget/widget.js` (~90 lines, zero dependencies, no build step): reads
  its own configuration off the `<script>` tag's attributes
  (`data-chat-url`, `data-position`, `data-color`) via
  `document.currentScript` -- the standard technique real embeddable
  widgets use so a host site never needs a config file or build step,
  just one tag. Renders a `position:fixed` circular bubble (bottom-right
  by default) and a `position:fixed` panel (380x600, capped to viewport
  on small screens) containing an `<iframe>`. The iframe's `src` is only
  ever set on first click (`iframeLoaded` guard) -- a host page that
  never gets a click never spins up a chatbot session at all.
  `?embed=true` on the iframe URL is Streamlit's own built-in embed mode.
- `app.py`: added `initial_sidebar_state="collapsed"` to
  `st.set_page_config` -- a ~380px-wide panel is too narrow to show chat
  and an expanded sidebar (document list, donor selector, on/off toggle)
  at once; collapsed-but-still-reachable (a small arrow remains) is the
  right default for a corner widget, and a reasonable, minor tradeoff for
  the normal full-page view too.
- `widget/demo_host.html` -- a minimal fake "host website" (a paragraph
  of placeholder campaign-site content) with nothing else on it but the
  one `<script>` embed tag, to make the "any platform, one line" claim
  concrete and testable rather than theoretical.
- Verified live in the Browser preview tool, opened as a real `file://`
  page (deliberately a different origin than `http://localhost:8501`, to
  actually exercise the cross-origin embed scenario a real separate
  website would hit, not just same-origin localhost convenience):
  the bubble renders and is clickable; clicking it toggles the panel
  open/closed and swaps the bubble glyph between 💬 and ✕; the iframe's
  `src` is confirmed (via direct property read) to be exactly
  `http://localhost:8501/?embed=true`, set only after the first click,
  not before. Cross-origin `iframe.contentDocument` access correctly
  throws (expected browser security behavior, confirms the two pages are
  genuinely different origins, not a bug) -- so the embed-mode rendering
  itself was separately confirmed by opening `?embed=true` directly in
  its own tab and checking real computed styles, not just DOM presence:
  the sidebar has `aria-expanded="false"` and an actual rendered width of
  0px (collapsed, not just present-in-DOM-but-hidden-some-other-way), the
  toolbar element that remains contains ONLY the small sidebar-reopen
  arrow (Streamlit's own Deploy button/hamburger menu/branding are
  genuinely gone, not just visually hidden), and there's no footer
  element at all. A screenshot of the demo host page with the widget open
  visually confirms the intended UX: a rounded floating panel in the
  bottom-right corner, sitting over dimmed host-page content, showing the
  real conversation from the post-Round-9 verification above (its
  follow-up chips and chat input), closable via the accent-purple bubble.
- Not verified: real cross-origin embedding against an actual second
  domain (this environment only has one reachable web origin,
  `localhost:8501` -- the `file://` test above exercises the SAME
  cross-origin restriction a real second domain would, but isn't a
  perfect substitute); whether a real production deployment's Streamlit
  server needs any additional CORS/XSRF config
  (`server.enableCORS`/`server.enableXsrfProtection`) to be iframed from
  a genuinely different domain than the one serving `widget.js` --
  Streamlit sets no `X-Frame-Options`/frame-blocking CSP by default, so
  this is expected to work, but wasn't checked against Streamlit's XSRF
  cookie behavior specifically; and whether Streamlit's own CSS at very
  small panel heights (this used a fixed 600px-tall panel, capped to
  viewport) ever clips content awkwardly on a genuinely tiny host
  viewport (e.g. an actual mobile browser, not just a narrow desktop
  browser tab standing in for one).

**Round 11 — imported the Lynx AI advisor question bank as a document.**
Owner provided `lynx-ai-advisor-question-bank.md` (a ~730-line capability
map of ~400 example questions a *Lynx* campaign advisor should handle,
organized into 29 categories, plus role-specific prompts, an answer
contract, and safety rules) and said to insert all of it into the
chatbot. Clarified first (the file is written for Lynx's real operational
data -- turf, canvassing production, staffing schedules, SMS/email
campaigns, events, petitions -- none of which exists in `rag_chatbot`'s
demo dataset) and confirmed the interpretation: added as
`documents/lynx_ai_advisor_question_bank.txt`, the 8th indexed document,
so the chatbot can retrieve and discuss the question bank's own content.
This does NOT give the chatbot the ability to actually answer those ~400
operational questions with real numbers -- that would require the actual
Lynx data model, which this demo doesn't have and was never asked to
build. Re-ran `python ingest.py` with the now-real API key: 81 total
chunks across 8 documents (57 from this one document alone, all with
real generated Contextual Retrieval context and a real, accurate one-
sentence document summary -- "Framework for a campaign advisor AI tool
that answers operational, strategic, and compliance questions with
evidence-based insights"). Verified live: `retrieve("What questions
should a campaign manager be able to ask?")` correctly surfaces this
document's content, top hit landing on its "Executive and campaign-
health questions" section header, exactly the relevant category.

**Round 12 — 10 more AI features.** Owner asked for "10 more AI features
within the chatbot," then separately asked to build all of them, verify
everything, audit for errors, and see it live -- all addressed in one
combined pass. Ten genuinely new, non-overlapping additions, each mapped
to a real module:
1. **Human handoff / escalation detection** (`escalation.py`) -- pure-
   Python signal scoring (frustration language, an explicit request for
   a person, a guarded topic, repeated rephrasing), zero AI calls for
   detection itself, same transparent-scoring philosophy as
   `lead_qualification.py`.
2. **Staff handoff summary** -- one Claude call, only spent once a
   conversation is actually flagged, condensing it for whoever picks it
   up (`escalation.summarize_for_handoff`).
3. **Volunteer signup drafting** (`volunteer_tools.py`) -- a
   `draft_volunteer_ask` agent tool mirroring `draft_donation_ask`'s
   "agent decides WHEN, tool supplies WHAT" pattern, grounded in real
   `campaign_field_ops_overview.txt` content when retrievable.
4. **Advocacy/petition action drafting** (`advocacy_tools.py`) -- a
   `draft_advocacy_ask` tool that takes an `issue_query`, grounds the ask
   in whatever's actually retrieved, and explicitly declines to draft
   anything if nothing relevant comes back.
5. **"Explain it differently"** (`refine.py`) -- rewrites an already-
   generated, already-cited answer into a different register (simpler/
   detailed/formal/casual) without re-retrieving or re-verifying; ephemeral
   UI result (session-only, never persisted).
6. **Persona-adaptive tone** (`persona.py`) -- infers donor/volunteer/
   press/general-public from real conversation keywords, folds a tone-
   only instruction into the system prompt, never changes facts.
7. **Auto-suggested FAQ content** (`faq_suggestions.py`) -- mines
   `storage.unanswerable_questions()` into AI-drafted candidate document
   content with explicit `[STAFF: fill in]` placeholders, never a
   fabricated answer.
8. **Document staleness flagging** (`staleness.py`) -- pure-Python year-
   extraction scan decides WHICH documents to flag; one cheap AI call
   per FLAGGED document explains WHY.
9. **Conversation topic auto-tagging** (`topic_tagging.py`) -- pure-
   Python keyword classification, zero AI calls (runs across every
   conversation on every Dashboard load).
10. **Weekly AI staff digest** (`staff_digest.py`) -- one Claude call
    synthesizing real, already-computed numbers (feedback, escalations,
    topics, unanswerable questions) into an executive summary, explicitly
    told never to invent a statistic it wasn't handed.

All ten wired into `rag_chain.py` (two new tools added to the agent's
`tools=` list + two new system-prompt rules; persona tone folded into
`system_for_turn` alongside the memory summary; escalation detection) and
`pages/1_Dashboard.py` (restructured to compute shared per-conversation
data -- lead score AND topic tag -- in one loop instead of reading the DB
twice, five new sections). New `storage.py` table: `escalations` (id,
conversation_id, reasons_json, score, summary, resolved, created_at) +
`save_escalation`/`open_escalations`/`resolve_escalation`.

**Three real bugs found and fixed during this round's own testing --
not theoretical, all caught by the smoke tests actually failing:**
- `escalation.detect_repeated_rephrasing`'s Jaccard threshold (`> 0.4`)
  was too strict: a realistic rephrasing pair ("What is the remote work
  stipend amount" vs "How much money is the remote stipend") scored
  exactly 0.4 and got excluded by the strict `>`. Fixed to `>= 0.35`.
- `persona.py`'s `_DONOR_SIGNALS` included `"stipend"` and `"gift"` --
  both collide with this demo's own unrelated `remote_work_policy.txt`
  vocabulary ("remote work **stipend**"), causing a real false-positive
  donor-persona classification on a plain HR-policy question. Removed
  both; `topic_tagging.py`'s `TOPIC_KEYWORDS["donations"]` had the exact
  same two words for the exact same reason and was fixed identically
  before it could fail the same way.
- **The most significant one**: escalation detection originally lived
  only in the "knowledge" code path, AFTER `intent.py`'s chitchat/
  knowledge branch. Live testing sent the exact message escalation exists
  to catch -- "This is so frustrating... I want to talk to a real
  person" -- and `intent.classify_intent` reasonably classified it as
  chitchat (short, not a factual question), which meant escalation
  detection never ran at all for the single most important case it's
  meant to catch. Fixed by moving escalation detection to the very top
  of `answer_question_stream`, before intent routing (or the semantic
  cache) can short-circuit anything -- it now runs on every turn
  regardless of how that turn gets handled. Confirmed via a direct script
  against the real pipeline: `classify_intent` really does return
  `"chitchat"` for that message, and escalation now fires anyway (score
  100, both reasons matched, a real accurate handoff summary generated).
- All three were caught specifically BECAUSE of this session's testing
  discipline (writing real assertions against real behavior, then
  actually running them, then trying the real UI) rather than assuming
  code that compiles and looks reasonable is correct -- exactly the
  "verify, don't assume" principle this whole project's HANDOFF has
  followed since Round 1.

**Verified live**, extensively, in a real browser session against the
real API key: asked "I'd love to volunteer and help canvass... how can I
get involved?" in the main chat -- the agent correctly called
`draft_volunteer_ask` (visible in the live tool-call progress), and the
resulting answer was genuinely well-grounded, citing real shift times,
check-in process, and training details from `campaign_field_ops_overview
.txt`, not generic filler. Clicked "Simpler" under that answer (after
working around this environment's react-aria/Streamlit-expander click
flakiness by dispatching a full pointerdown/mousedown/pointerup/mouseup/
click event sequence via JS, rather than a single synthetic click) and
got back a real, genuinely simpler rewrite -- shorter sentences, same
facts, every `[campaign_field_ops_overview.txt#N]` citation tag preserved
exactly. Sent the frustration/human-request message twice: the FIRST time
(before the fix) correctly reproduced the bug live (no escalation
appeared on the Dashboard); after the fix and a fresh server restart, a
direct pipeline script confirmed the fix definitively (real intent
classification, real escalation firing, real handoff summary) since
re-triggering the exact live browser flow a second time ran into this
environment's chat-input-submission flakiness (a recurring friction
point with this specific browser automation tool in this session, not an
app bug -- see the Round 5/6 HANDOFF notes on the same class of issue).
Confirmed on the Dashboard, live: the real escalation appeared with its
real score/reasons/summary; clicking "Mark resolved" made it disappear
(`storage.resolve_escalation` confirmed working both via the smoke test's
direct round-trip AND this live click); the Conversation Topics bar chart
showed real classifications (`policy_general: 2`, `volunteering: 1`)
matching the actual conversations that happened; the Document Usage chart
showed `lynx_ai_advisor_question_bank.txt` had actually been cited; and
clicking "Generate staff digest" produced a genuinely well-reasoned
executive summary using only the real numbers on the page (6
conversations, 10 messages, 0 escalations, the real topic split) plus one
concrete, sensible recommendation, with no invented statistic. **Not**
live-verified through the browser: the advocacy-ask tool (`draft_advocacy
_ask`), FAQ suggestion drafting (no unanswerable questions existed yet in
this session to mine), and document staleness flagging (none of the 8
current documents are old enough to trip the default 1-year threshold) --
all three were verified structurally (compile + the pure-Python halves'
smoke tests + API-failure fallback tests) but not exercised with real
Claude output through the live UI.

**Round 13 — full audit pass, no new features.** Owner asked to audit and
verify there weren't any errors. Static analysis (`py_compile` +
`pyflakes` across all 33 Python files), a migration check against the
real, already-populated `chat_history.db`, a real-API smoke test of every
pure-Python module added since Round 9 (compliance guardrail, ask
personalization, escalation, persona, topic tagging), a real end-to-end
retrieval call against the live FAISS/BM25 index, and a live browser
session driving a real chat turn through the real Claude API.

Found and fixed:
- Two dead imports (`compliance_guardrail` in `fundraising_tools.py`,
  `timedelta` in `campaign_data.py`) -- harmless, `pyflakes` caught both;
  removed.
- **One real, previously-undiscovered rendering bug, confirmed live**:
  Streamlit's `st.markdown()` treats a `$...$` pair as inline LaTeX math
  by default. Asking "How much is the remote work internet stipend?" --
  an answer that legitimately mentions two dollar amounts, `$40/month`
  and a separate `$750` a sentence later -- rendered as a garbled math
  expression instead of plain currency text, because everything between
  the FIRST `$` and the SECOND `$` in the whole message got interpreted
  as one inline-math span. Confirmed via the rendered DOM (`.katex`
  elements present) before the fix and absent after. Given this app is
  fundraising-themed, dollar amounts appear constantly across answers,
  the Dashboard's compliance section, the staff digest, and the refine
  feature -- this wasn't a one-off, it would have hit real usage
  regularly. Root cause was structural (a Streamlit default), not
  specific to any one answer's content, so the fix is a shared escape
  helper (`models.escape_markdown_dollars`, replaces every literal `$`
  with `\$` at display time only -- never touches citation text,
  persisted data, or anything fed back to the model) applied at every
  `st.markdown()` call site that can carry a real dollar amount: the main
  chat's history/streaming/final-answer render and the refine result in
  `app.py`, and the staff digest, unanswered-questions list, and
  employer-cluster compliance line in `pages/1_Dashboard.py`. Call sites
  that only ever render app-constructed labels with no `$` risk (citation
  headers, escalation reason tags, staleness/lead-score lines) were left
  alone. `pages/2_Donor_Stewardship.py` and `pages/3_Compete.py` were
  already safe by construction -- every AI-drafted message body on those
  pages renders through `st.text_area` (a plain HTML textarea, no
  markdown/LaTeX interpretation at all), only short app-constructed
  headers go through `st.markdown()`. Verified live after the fix: the
  exact same real answer that broke before now renders both dollar
  amounts as plain text, confirmed via `.katex` element count dropping to
  zero on both the main chat (streamed and resumed-from-history) and the
  Dashboard's compliance section (`combined $2,700 of $3,300 limit`,
  which has the same two-`$`-in-one-line shape and is app-constructed,
  not AI text -- confirming the bug wasn't specific to model output).
- One operational note, not a code bug: after editing `app.py` and
  `models.py` while the Streamlit server was already running, its file
  watcher hot-reloaded `app.py` but kept a stale cached `models` module
  without the new function, producing a real but misleading
  `ImportError`. A full server restart (not just a page reload) resolved
  it -- worth remembering for any future mid-session edit to a module
  that's already deeply imported by other already-loaded modules.

Nothing else found: every hardcoded document filename referenced in code
matches a real file in `documents/`; every environment variable read via
`os.environ.get` in code has a matching entry in `.env.example` and vice
versa; every module's fail-open/fail-closed contract (verification,
groundedness, semantic cache, escalation, refine, staleness, FAQ
suggestions, staff digest) reads correctly on inspection; the Round 13
voter-info feature (built and then removed earlier in this session per
owner request) left no trace in code, `documents/`, or the index.

## What's verified vs. not

Full checklist in `README.md`. Short version: everything that doesn't
need `ANTHROPIC_API_KEY` or a working Vectorize connection has been
checked (retrieval pipeline including the relevance floor, multi-query
fusion, MMR, sentence-window expansion, and query-adaptive fusion
weighting; the groundedness check; the semantic cache's threshold
calibration end-to-end (hit/miss/documented-limitation-miss); the
conversational-rewriting gate and fallback path; calculator safety;
SQLite persistence including empty-DB edge cases and every migration --
settings, groundedness_json, follow_ups_json, conversations.summary,
response_cache -- against a real pre-existing database; the entire agent
loop's control flow via mocks; the Vectorize SDK's schema; every Round 9
pure-Python/deterministic module -- campaign_data, compliance_guardrail,
ask_personalization, lead_qualification, and every Claude-backed Round 9
function's API-failure fallback path; and the on/off toggle and the FULL
app, all 22 modules and 4 pages (main chat, Dashboard, Donor Stewardship,
Compete), live in a real Streamlit session including the new donor-
selector dropdown driven end-to-end; the embeddable widget's cross-origin
iframe embed and Streamlit's `?embed=true` chrome-stripping, both checked
via real computed styles, not just DOM presence). **With a real
`ANTHROPIC_API_KEY` now set** (added by the owner after Round 9), also
verified with real generated output: real Contextual Retrieval context
blurbs and document summaries (re-ingested for real), a real cited
chat answer with real follow-up suggestions, and a real, correctly-
personalized donor reactivation draft. Still not verified: real streaming
token-by-token output, a real rewritten (conversational-query-rewrite)
query's actual text, real intent classification/chitchat replies, real
multi-query-expansion output, real conversation-memory summaries, real
win-back sequences/impact reports/Compete drafts/channel variants/non-
English translation (4 of Round 9's 6 Claude-backed features), real
cross-origin widget embedding against an actual second domain (only one
web origin was reachable in this environment), and any real Vectorize.io
query. **Round 11** (the Lynx AI advisor question bank import) was
verified live via a real retrieval call surfacing the new document's
content correctly. **Round 12** (10 more AI features) was verified live
more extensively than any prior round: the volunteer-ask agent tool, the
"Explain it differently" refine feature, escalation detection (including
confirming and then fixing a real control-flow bug where it was bypassed
by chitchat classification), the Dashboard's new escalations panel/topic
chart/staff digest were all exercised against the real API and real UI.
Still not live-verified from Round 12: the advocacy-ask tool, FAQ
suggestion drafting (no unanswerable questions existed to mine), and
document staleness flagging (no document old enough to trip the
threshold) — see the Round 12 section above for detail.

## Not built (raised, not chosen)

From the Round 3 upgrade menu: **in-UI document upload** (still requires
dropping files into `documents/` and clicking "Re-index" or running
`python ingest.py`), **multi-pipeline source selector**
(the agent decides which sources to search itself; there's no UI toggle
to restrict it to "local only" or "Vectorize only" per conversation).

## Files

```
rag_chatbot/
├── README.md                 full architecture + verified/not + audit log
├── HANDOFF.md                 this file
├── requirements.txt
├── .env.example                ANTHROPIC_*, EMBEDDING_MODEL, RERANKER_MODEL,
│                                CONTEXTUALIZE_CHUNKS/CONTEXT_MODEL,
│                                ADVANCED_QUERY_EXPANSION/EXPANSION_MODEL,
│                                MIN_RERANK_SCORE, USE_MMR/MMR_LAMBDA,
│                                NEIGHBOR_WINDOW, GROUNDEDNESS_CHECK/
│                                GROUNDEDNESS_THRESHOLD, SEMANTIC_CACHE/
│                                SEMANTIC_CACHE_THRESHOLD, QUERY_INTENT_ROUTING/
│                                INTENT_MODEL, DOC_SUMMARIES/DOC_SUMMARY_MODEL,
│                                FOLLOWUP_SUGGESTIONS/FOLLOWUP_MODEL,
│                                MEMORY_SUMMARIZATION/MEMORY_SUMMARY_MODEL,
│                                QUERY_REWRITING/REWRITE_MODEL,
│                                ADAPTIVE_FUSION_WEIGHTING/
│                                EXACT_SIGNAL_KEYWORD_BOOST, VECTORIZE_*
├── documents/                 sample knowledge base (3 .txt files)
├── index/                     vectors.faiss + chunks.json + document_summaries.json
│                                (pre-built, from the sample docs)
├── models.py                  RetrievedChunk + chunk_index_text + sources_from_json +
│                                query_fusion_weights (zero heavy deps)
├── ingest.py                  chunk + contextualize (Contextual Retrieval) + per-document
│                                AI summaries + embed + build the index + clear response cache
├── retrieval.py               HybridRetriever: vector + BM25 + query-adaptive RRF fusion +
│                                rerank + relevance floor + multi-query expansion + MMR +
│                                sentence-window neighbor expansion
├── tools.py                   query_documents (+ conversational rewriting, query
│                                expansion, neighbor windows), calculator, vectorize_search
├── query_rewrite.py            resolves a context-dependent query ("how much is it?")
│                                into a self-contained one before it's searched
├── rag_chain.py                the agentic loop (answer_question_stream) -- now also
│                                orchestrates intent routing, the semantic cache, memory
│                                summarization, and follow-up suggestions
├── verification.py             independent LLM-based citation-checking pass
├── groundedness.py             independent embedding-based sentence-level grounding check
├── semantic_cache.py           reuse a prior answer verbatim for a near-duplicate question
├── intent.py                   chitchat/meta vs. knowledge-question routing
├── followups.py                AI-generated follow-up question suggestions
├── memory.py                   conversation memory summarization beyond HISTORY_WINDOW
├── storage.py                  SQLite persistence + observability queries + settings
│                                (on/off toggle) + response_cache + conversation summaries
├── app.py                      Streamlit chat UI + on/off toggle + document summaries +
│                                follow-up chips + intent/cache-hit status + Round 9's
│                                donor selector + donation-ask amount chips
└── pages/
    ├── 1_Dashboard.py           observability + cache stats + Round 9's Compliance and
    │                            Lead Qualification sections
    ├── 2_Donor_Stewardship.py   Round 9, STAFF page: reactivation/win-back/impact-report
    │                            drafts + channel variants
    └── 3_Compete.py             Round 9, STAFF page: opposition-research drafting
```

**Round 9 additions** (campaign fundraising demo -- see the Round 9 note
above for the full story and consolidation decisions):
```
campaign_data.py          9 fictional mock donors/prospects + Donation/Donor dataclasses
compliance_guardrail.py   pure-Python contribution-limit + employer-cluster check, zero AI
ask_personalization.py    deterministic ask-amount suggestion + concrete impact phrasing
fundraising_tools.py      the draft_donation_ask agent tool (wired into rag_chain.py)
stewardship.py            reactivation / win-back sequence / impact report drafts
competitive_intel.py      contrast message / rebuttal drafts, scoped to opponent_public_record.txt
channel_variants.py       reformats one message for email/SMS/social's real constraints
lead_qualification.py     pure-Python conversation-signal scoring, zero AI
multilingual.py           translates a non-English query to English before retrieval
documents/campaign_contribution_limits.txt   fictional example limit policy
documents/campaign_impact_stats.txt          fictional $-to-impact-unit reference
documents/opponent_public_record.txt          fictional opponent public record
documents/campaign_field_ops_overview.txt     fictional staff field-ops reference
```
New `.env.example` vars: `MULTILINGUAL`/`TRANSLATE_MODEL` (everything else
Round 9 added has no env toggle -- `compliance_guardrail.py`,
`ask_personalization.py`, `lead_qualification.py` are always-on pure
Python with no API cost to gate, and the three drafting modules are
staff-invoked on their own dedicated pages, not something that runs on
every chat turn the way e.g. intent routing does).

**Round 10 addition** (embeddable floating widget -- see the Round 10
note above):
```
widget/widget.js          the floating bubble + iframe embed shell (the ONLY non-Python file)
widget/demo_host.html     a fake "host website" proving the one-script-tag embed claim
```
`app.py` also gained `initial_sidebar_state="collapsed"` in its
`st.set_page_config` call (see the Round 10 note for why).

**Round 12 additions** (10 more AI features -- see the Round 12 note
above for the full story, including three real bugs caught and fixed):
```
escalation.py         human handoff / escalation detection + staff summary
volunteer_tools.py     draft_volunteer_ask agent tool
advocacy_tools.py      draft_advocacy_ask agent tool
refine.py              "explain it differently" answer rewriting
persona.py             donor/volunteer/press/general-public tone adaptation
faq_suggestions.py     drafts candidate FAQ content from real unanswered questions
staleness.py           flags documents with old dated language
topic_tagging.py       pure-Python per-conversation topic classification
staff_digest.py        AI executive summary of real Dashboard numbers
```
`storage.py` gained the `escalations` table; `rag_chain.py` gained two
new agent tools, two new system-prompt rules, and persona/escalation
wiring; `app.py` gained the refine buttons; `pages/1_Dashboard.py` was
restructured with five new sections and now computes lead-score AND
topic-tag together in one shared per-conversation loop.

A `rag-chatbot` config was also added to the parent repo's
`.claude/launch.json` (alongside Lynx's own `lynx-dev` entry) so the
Browser preview tool can launch this app directly — see the Round 5 note
above for why it uses `python -m streamlit run <path>` via PowerShell
rather than a plain `streamlit run` command.

## Next steps

1. Add a real `ANTHROPIC_API_KEY` and run the verification checklist in
   README.md for real -- this now also covers re-running `python
   ingest.py` WITH a key to see real Contextual Retrieval context blurbs
   get generated (currently un-exercised), setting
   `ADVANCED_QUERY_EXPANSION=true` to see real multi-query paraphrases,
   and asking a real vague follow-up ("how much is it?" after discussing
   the internet stipend) to see `query_rewrite.py` actually resolve it.
2. If using Vectorize: confirm the three `VECTORIZE_*` vars against a
   real, working pipeline (this session's own connector was broken, so
   this is genuinely untested).
3. Decide whether this belongs in its own git repo, or committed into the
   Lynx one it's currently sitting untracked inside (they're unrelated
   projects sharing a folder by accident of where this session created
   files) — nothing has been committed either way.
4. Pick up either of the two "raised, not chosen" features above if
   wanted.
5. Once a real key is available, re-ingest with Contextual Retrieval on
   and A/B the retrieval quality (dashboard's retrieval-score trend line,
   or a quick before/after on a few real questions) against the previous
   plain-text index -- this session could only confirm the code path
   works end-to-end structurally, not that it actually improves answers.
6. Try MMR (`USE_MMR=true`, the default) against a bigger, more redundant
   real document set than this demo's 10-chunk corpus -- with only 3
   sample documents there's rarely more than one near-duplicate chunk to
   trade off, so this round's verification confirmed the mechanism is
   correct without seeing it meaningfully change a real result.
7. Watch the groundedness expander against real generated answers for a
   while and tune `GROUNDEDNESS_THRESHOLD` (default 0.3) if it's flagging
   too many faithful paraphrases (raise it) or missing real fabrications
   (lower it) -- it was only validated against one hand-built
   faithful/fabricated pair in this session, not a real distribution of
   Claude-generated answers.
8. Once a real key is available, exercise all five Round 7 features live:
   watch a real chitchat classification + reply, a real follow-up
   suggestion set, a real document summary, a real conversation-memory
   summary once a chat crosses `HISTORY_WINDOW` (10 turns -- have a real
   back-and-forth that long), and a real semantic-cache hit by literally
   re-asking (or lightly retyping) the same question twice in the UI.
9. If loose-paraphrase cache hits (not just near-duplicate re-askings)
   turn out to matter in practice, `semantic_cache.py`'s docstring already
   documents why the current embedding model can't safely do that at any
   single threshold -- the real fix would be a dedicated short-text/
   question-similarity embedding model for the CACHE specifically
   (separate from `EMBEDDING_MODEL`, which is tuned for retrieval's
   query-vs-chunk comparisons, a different task), not a threshold tweak.
10. Watch the Dashboard's new cache-hit metric over real usage -- this
    session could only confirm the mechanism (a controlled hit/miss/miss
    triple), not what hit rate looks like against real question traffic.
11. Once a real key is available, have a real multi-turn conversation with
    a vague follow-up ("what about the wifi one?" after asking about a
    different stipend) and confirm `query_rewrite.py` produces a sensible
    self-contained query in the sidebar's "searches the agent ran"
    caption -- this session only verified the gating heuristic and the
    API-failure fallback, not real rewrite output.
12. Try `ADAPTIVE_FUSION_WEIGHTING` against a real question that's
    genuinely ambiguous between exact-fact and conceptual (e.g. a query
    with a number that's actually asking a conceptual question about that
    number) -- this round's regex signals are a reasonable heuristic, not
    a guarantee, and haven't been checked against an adversarial or edge
    case query yet.
13. Once a real key is available, exercise all six Round 9 Claude-backed
    features live: select "Sam Whitfield" in the sidebar and ask the chat
    something that clearly signals donation interest to see a real
    `draft_donation_ask` tool call and real amount chips; generate a real
    reactivation/win-back/impact-report draft on the Donor Stewardship
    page for a lapsed donor (try Marcus Webb or Aiden Foster); generate a
    real contrast message and rebuttal on the Compete page; generate real
    channel variants of a pasted message; and ask a question in Spanish
    or another language to confirm both the query-translation-before-
    retrieval path AND that the agent actually responds in-language (rule
    8 in `AGENT_SYSTEM`) rather than just acknowledging the instruction.
14. Decide whether `campaign_data.py`'s static mock data should become a
    real, editable data source (even just a JSON file staff can hand-
    edit, short of a real CRM integration) -- right now adding/changing a
    donor means editing Python source, which is fine for a demo but not
    for actual use.
15. If this campaign-fundraising pivot is the direction going forward,
    reconsider whether the original Aurora Robotics workplace-policy
    documents (`remote_work_policy.txt`, `product_faq.txt`,
    `engineering_onboarding.txt`) should be removed from the demo corpus
    -- they were kept this round specifically as an untouched regression-
    test corpus (Round 1's original cross-document-boundary test), but a
    real campaign deployment wouldn't want a fictional tech company's HR
    policy answerable by its donor-facing chatbot.
16. `draft_donation_ask`'s tool description and the system prompt (rule
    7) are the ONLY guardrail keeping the agent from bringing up
    donations unprompted -- this is a prompt-level safeguard, not a
    structural one (nothing prevents the model from calling the tool if
    it judges a message as donation-adjacent when a human wouldn't).
    Worth watching real conversations for false-positive donation asks
    once a key is available, the same way `GROUNDEDNESS_THRESHOLD` needed
    real-world tuning.
17. Deploy the real Streamlit app somewhere with a public URL (Streamlit
    Community Cloud, or any host that can run `streamlit run app.py`) and
    update `widget.js`'s `data-chat-url` to point at it -- everything
    Round 10 built was verified against `localhost:8501`, which only the
    machine actually running it can reach. A real campaign site would
    need `data-chat-url` set to that public URL, not localhost.
18. Test the real cross-origin case Round 10 could only approximate: host
    `widget.js` + a real page on an actual second domain (or even a
    second localhost port acting as a stand-in "different site") pointed
    at the deployed chatbot, and confirm the iframe still embeds cleanly
    -- if it doesn't, check Streamlit's `server.enableXsrfProtection` /
    `server.enableCORS` flags first.
19. Consider whether the widget needs a "start closed vs. start open"
    option, an unread-message badge, or a welcome message the FIRST time
    a visitor opens it -- none of that exists yet; `widget.js` is
    intentionally minimal (open/closed only) rather than guessing at
    product requirements nobody asked for yet.
20. Exercise Round 12's three still-unverified-live features once real
    conditions exist: ask something petition/action-oriented on a real
    issue to see `draft_advocacy_ask` fire (needs a question grounded in
    real indexed content, or confirm it honestly declines when nothing
    matches); let a real unanswerable question accumulate, then click
    "Draft FAQ content" on the Dashboard; and either lower
    `STALE_AFTER_YEARS` for a quick test or wait for the real documents to
    age past the 1-year default to see a real staleness flag + AI
    explanation render.
21. Watch `ESCALATION_THRESHOLD` (default 50) against real conversations
    the way `GROUNDEDNESS_THRESHOLD` needed real-world tuning -- this
    round's scoring was validated against hand-built frustration/human-
    request/guarded-topic messages plus the one live escalation test, not
    a real distribution of actual user frustration.
22. `persona.py`'s keyword lists (donor/volunteer/press) are a first pass
    -- watch real conversations for more false-positive/false-negative
    collisions the way `_DONOR_SIGNALS`' "stipend"/"gift" collision was
    caught this round, since any keyword list added later risks the same
    class of bug against this demo's own unrelated HR-policy documents.
23. The refine feature's rewrites are never re-run through the
    groundedness checker -- it's trusted to preserve facts/citations by
    prompt instruction alone (rule in `refine.py`'s system prompt), the
    same category of prompt-level-only guardrail as item 16 above. Worth
    watching real "Simpler"/"More detail" rewrites for drift once used
    heavily.
