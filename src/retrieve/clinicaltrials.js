/**
 * ClinicalTrials.gov retrieval via the official v2 API.
 *
 * No registration and no key. Used here for the role CENTRAL plays in a
 * Cochrane-style search: it supplies trial registry records, including ongoing
 * and unpublished studies that never appear in journal databases.
 *
 * This is NOT a substitute for CENTRAL. CENTRAL is a curated register of
 * controlled trials assembled by Cochrane; ClinicalTrials.gov is one of its
 * contributing registries. Where a guideline requires CENTRAL specifically, a
 * Cochrane subscription is still needed.
 *
 * API reference: https://clinicaltrials.gov/data-api/api
 */

import { fetchText, sleep, RetrieveError } from "./common.js";

const BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;

export const name = "clinicaltrials";
export const label = "ClinicalTrials.gov";
export const requiresAuth = false;

function toRecord(study) {
  const p = study?.protocolSection || {};
  const id = p.identificationModule || {};
  const status = p.statusModule || {};
  const design = p.designModule || {};
  const arms = p.armsInterventionsModule || {};
  const outcomes = p.outcomesModule || {};
  const eligibility = p.eligibilityModule || {};
  const contacts = p.contactsLocationsModule || {};
  const sponsor = p.sponsorCollaboratorsModule || {};

  const interventions = (arms.interventions || [])
    .map((i) => [i.type, i.name].filter(Boolean).join(": "))
    .filter(Boolean);

  const conditions = p.conditionsModule?.conditions || [];

  const primary = (outcomes.primaryOutcomes || [])
    .map((o) => o.measure)
    .filter(Boolean);
  const secondary = (outcomes.secondaryOutcomes || [])
    .map((o) => o.measure)
    .filter(Boolean);

  const locations = [
    ...new Set((contacts.locations || []).map((l) => [l.city, l.country].filter(Boolean).join(", "))),
  ].filter(Boolean);

  const nctId = id.nctId || "";
  const startDate = status.startDateStruct?.date || "";
  const year = (startDate.match(/(1[89]\d{2}|20\d{2})/) || [])[1] || "";

  // Assemble a screening-friendly abstract, since registry entries have no
  // real abstract field.
  const parts = [];
  if (p.descriptionModule?.briefSummary) parts.push(p.descriptionModule.briefSummary);
  if (design.phases?.length) parts.push(`Phase: ${design.phases.join(", ")}`);
  if (design.enrollmentInfo?.count != null) parts.push(`Enrollment: ${design.enrollmentInfo.count}`);
  if (interventions.length) parts.push(`Interventions: ${interventions.join("; ")}`);
  if (primary.length) parts.push(`Primary outcomes: ${primary.join("; ")}`);
  if (secondary.length) parts.push(`Secondary outcomes: ${secondary.slice(0, 5).join("; ")}`);
  if (eligibility.eligibilityCriteria) {
    parts.push(`Eligibility: ${String(eligibility.eligibilityCriteria).replace(/\s+/g, " ").slice(0, 800)}`);
  }

  const keywords = [
    ...conditions,
    ...(design.phases || []),
    design.studyType || "",
    ...interventions.slice(0, 6),
  ].filter(Boolean);

  return {
    title: id.briefTitle || id.officialTitle || "",
    authors: [sponsor.leadSponsor?.name, ...(sponsor.collaborators || []).map((c) => c.name)].filter(Boolean),
    source: "ClinicalTrials.gov",
    sourceAbbrev: "NCT",
    year,
    pubDate: startDate,
    docType: ["Clinical trial registry record", design.studyType, ...(design.phases || [])]
      .filter(Boolean)
      .join("; "),
    keywords,
    abstract: parts.join(" "),
    doi: "",
    pmid: "",
    registryId: nctId,
    volume: "",
    issue: "",
    pages: "",
    issn: "",
    url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "",
    language: "English",
    // Registry-specific screening fields.
    recruitmentStatus: status.overallStatus || "",
    conditions,
    interventions,
    enrollment: design.enrollmentInfo?.count ?? "",
    locations,
    hasResults: !!study.hasResults,
  };
}

/**
 * Search ClinicalTrials.gov.
 *
 * @param {string} query free-text term, or use opts for fielded search
 * @param {{limit?:number, condition?:string, intervention?:string, status?:string,
 *          advancedFilter?:string}} [opts]
 */
export async function retrieve(query, opts = {}) {
  const limit = opts.limit ?? 200;
  const records = [];
  let pageToken = "";
  let totalHits = 0;
  let pages = 0;

  while (records.length < limit) {
    const want = Math.min(PAGE_SIZE, limit - records.length);
    const params = new URLSearchParams({ pageSize: String(want), countTotal: "true" });
    if (query) params.set("query.term", query);
    if (opts.condition) params.set("query.cond", opts.condition);
    if (opts.intervention) params.set("query.intr", opts.intervention);
    if (opts.status) params.set("filter.overallStatus", opts.status);
    if (opts.advancedFilter) params.set("filter.advanced", opts.advancedFilter);
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${BASE}?${params}`;
    const data = await fetchText(url, { parse: "json" });
    if (!data || typeof data !== "object") {
      throw new RetrieveError("unexpected ClinicalTrials.gov response", { url });
    }
    if (pages === 0) totalHits = Number(data.totalCount ?? 0);

    const studies = data.studies || [];
    if (!studies.length) break;
    for (const s of studies) {
      records.push(toRecord(s));
      if (records.length >= limit) break;
    }

    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
    pages++;
    if (pages > 100) break;
    await sleep(200);
  }

  return {
    source: label,
    sourceKey: name,
    query,
    totalHitsReported: totalHits,
    retrievedCount: records.length,
    records,
  };
}
