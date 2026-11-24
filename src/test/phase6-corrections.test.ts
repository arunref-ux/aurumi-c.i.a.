import { beforeEach, describe, expect, it } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { deliveryControls } from "@/data/network";
import { store, memoryBackend, STORAGE_KEY, QUARANTINE_KEY } from "@/data/store";
import { canonical } from "@/domain/assessment";
import { contentValue, improvement, proposalScopeTerms, workspaceProblems, type ServiceTerms } from "@/domain/delivery";
import { metricFor, validateMetric, timestampInstant, STRONG_CONTRACT, type MeasurementDefinition } from "@/domain/delivery-evidence";
import { issuedProposal } from "./proposal-fixtures";
import { reset, M, A, P, R, HOTEL, STREAM, D, O, creation, first, faults, readyCompletion, completionInput } from "./delivery-fixtures";
import history from "./fixtures/phase6-9ce518a-history.json";

beforeEach(reset);
const observation = (value: number | null = 80, observedAt = new Date().toISOString()) => ({ value, observedAt, qualitative: "Actual observation", source: "Customer reporting observation", provenance: "customer_reported" as const, evidence: ["mock://file-hub/observed-evidence"] });
async function freshReview(id = HOTEL) {
  return E.review(M,id,{kind:"completion",scheduledAt:new Date().toISOString(),calendarReference:"mock://calendar",summary:"Actual results and limitations reviewed",customerFeedback:completionInput.customerFeedback,nextActions:completionInput.outstandingResponsibilities,outstandingResponsibilities:completionInput.outstandingResponsibilities,participants:["customer","u_manager"],evidence:"mock://review",comment:"Current completion state approved for independent closure"});
}
async function proposalEngagement() {
  const {issued}=await issuedProposal(); const total=first(issued.document.commercials.summary.totals);
  const input=creation({ origin:"proposal",customerName:issued.document.recipient.organization || issued.document.recipient.name,proposalVersionId:issued.id,allocationId:"corrective-allocation",terms:{...creation().terms,...proposalScopeTerms(issued),currency:total.currency,amount:total.initialCost} });
  const result=await E.create(M,input);
  for(const next of ["pending_authorization","authorized","mobilizing","active"]) await E.transition(M,result.engagement.id,next,"mock://authorization","Authorized issued scope");
  return {issued,input,id:result.engagement.id};
}
async function map(id=HOTEL, deliverableIds=[D]) {
  const o=first((await E.get(M,id)).obligations);
  return E.mapObligation(M,id,{obligationId:o.id,deliverableIds,milestoneIds:[],workstreamIds:[],reviewIds:[],coverage:o.criteria,evidence:["mock://coverage"],comment:"Delivery evidence covers original acceptance criteria"});
}
function definition(overrides: Partial<Parameters<typeof E.outcome>[2]> = {}): Parameters<typeof E.outcome>[2] {
  return {objective:"Reduce reporting duration",definition:"Minutes to prepare the same report",unit:"minutes",type:"quantitative",baseline:120,baselineDescription:"Established 120 minute reporting baseline",baselineEvidence:["mock://baseline"],target:60,targetDescription:"Target, not guarantee",direction:"decrease",frequency:"Monthly",ownerProfessionalId:"pro_rohan",workstreamId:STREAM,...overrides};
}
const scopeChange = async (input?: ServiceTerms) => { const terms=input ?? first((await E.get(M,HOTEL)).scopes).terms; return E.change(M,HOTEL,{requested:"Extra review",reason:"Customer requested review",impact:"Additional service",scheduleImpact:"",commercialImpact:"INR 999999 restricted impact",terms,revisedProposalVersionId:""}); };
function corrupt(edit: (saved: ReturnType<typeof JSON.parse>) => void) {
  const b=memoryBackend(); store.attach(b); store.durable(()=>{});
  const saved=b.read(STORAGE_KEY); if(!saved) throw Error("No saved envelope");
  const raw: ReturnType<typeof JSON.parse>=JSON.parse(saved); edit(raw); b.write(STORAGE_KEY,JSON.stringify(raw)); store.attach(b); return b;
}

describe("F01 authorized source obligations", () => {
  it("rejects substituted scope on the genuine INR 60000 issued proposal", async () => {
    const {issued}=await issuedProposal(); const total=first(issued.document.commercials.summary.totals);
    expect(total.initialCost).toBe(60000);
    expect(issued.document.deliverables.some((d) => d.acceptanceCriterion.includes("Daily ageing list"))).toBe(true);
    await expect(E.create(M,creation({origin:"proposal",customerName:issued.document.recipient.organization||issued.document.recipient.name,proposalVersionId:issued.id,allocationId:"counterexample",terms:{...creation().terms,amount:60000,included:"Unrelated substituted service"}}))).rejects.toThrow("scope");
    expect(store.table("deliveryWorkspaces").filter((w) => w.initiation.source.kind==="proposal")).toHaveLength(0);
  });
  it("cannot complete a genuine issued commitment with zero operational deliverables", async () => {
    const {id}=await proposalEngagement(); await freshReview(id); await E.transition(M,id,"completion_review","mock://request","Request completion");
    await expect(E.complete(A,id,completionInput)).rejects.toThrow("Required obligation");
    expect((await E.get(A,id)).workspace.deliverables).toHaveLength(0);
    expect((await E.get(A,id)).completion).toBeNull();
  });
  it("an unmapped required obligation blocks otherwise reviewed closure", async () => {
    await readyCompletion();
    const w=first(store.table("deliveryWorkspaces")); w.obligationMappings=[];
    store.replace("deliveryWorkspaces",store.table("deliveryWorkspaces").map((r) => r.id===w.id?w:r));
    await freshReview(); await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("unmapped");
  });
  it("a mapped but unaccepted obligation remains outstanding", async () => {
    const v=await map(); expect(first(v.obligations).status).toBe("in_progress"); expect(v.completionBlockers.some((p) => p.includes("Required obligation"))).toBe(true);
  });
  it("an unrelated engagement deliverable cannot be mapped", async () => {
    await expect(map(HOTEL,["deliverable_delivery_distribution"])).rejects.toThrow("mapping references");
    expect(first((await E.get(M,HOTEL)).obligations).mapping?.deliverableIds).toEqual([D]);
  });
  it("acceptance with different criteria cannot satisfy a commitment", async () => {
    await readyCompletion();
    const o=first((await E.get(M,HOTEL)).obligations);
    await E.mapObligation(M,HOTEL,{obligationId:o.id,deliverableIds:[D],milestoneIds:[],workstreamIds:[],reviewIds:[],coverage:"Unrelated acceptance criteria",evidence:["mock://coverage"],comment:"Counterexample"});
    expect(first((await E.get(M,HOTEL)).obligations).status).toBe("awaiting_acceptance");
  });
  it("multiple accepted records may satisfy one obligation", async () => {
    await readyCompletion(); const original=first((await E.get(M,HOTEL)).workspace.deliverables);
    let v=await E.deliverable(M,HOTEL,{workstreamId:STREAM,ownerProfessionalId:"pro_rohan",title:"Supplementary findings",description:"Additional coverage",criteria:original.criteria,due:"2026-12-04",required:false,independentReview:true,acceptanceKind:"customer_acceptance",artifactReference:"mock://supplement"});
    const d=v.workspace.deliverables.at(-1); if(!d) throw Error("No supplementary artifact");
    await E.transition(M,HOTEL,"active","mock://resume","Supplementary delivery");
    v=await E.submitDeliverable(M,HOTEL,d.id); const version=v.workspace.deliverables.at(-1)?.versions.at(-1); if(!version) throw Error("No version");
    await E.reviewDeliverable(A,HOTEL,d.id,version.id,"customer_acceptance","accepted","mock://accept","Additional customer evidence");
    await map(HOTEL,[D,d.id]); expect(first((await E.get(M,HOTEL)).obligations).status).toBe("satisfied");
  });
  it.each(["remove","supersede"] as const)("only an applicable approved %s amendment changes obligations and preserves originals",async(action) => {
    const prior=await E.get(M,HOTEL), o=first(prior.obligations);
    await E.change(M,HOTEL,{requested:"Revised commitment",reason:"Explicit customer scope decision",impact:"Authorized obligation change",scheduleImpact:"",commercialImpact:"",terms:first(prior.scopes).terms,revisedProposalVersionId:"",obligationAmendments:[{obligationId:o.id,action,description:action==="supersede"?"Replacement service":"",criteria:action==="supersede"?"Replacement acceptance":"",reason:"Customer authorized change"}]});
    const change=first((await E.get(M,HOTEL)).workspace.changes); await E.approveChange(A,HOTEL,change.id,"approved","mock://approve","Independent applicable amendment"); await E.applyChange(A,HOTEL,change.id);
    const after=await E.get(M,HOTEL); expect(after.initiation).toEqual(prior.initiation); expect(after.obligations.find((r) => r.id===o.id)?.status).toBe(action==="remove"?"removed_by_amendment":"superseded_by_amendment");
    expect(first(store.table("deliveryWorkspaces")).obligations?.find((r) => r.id===o.id)).toEqual(first(prior.initiation?.obligations ?? []));
  });
  it("limited direct advisory completes through authorized service evidence without artificial artifacts",async() => {
    const v=await E.create(M,creation({services:["ongoing_advisory"]})), id=v.engagement.id;
    for(const next of ["pending_authorization","authorized","mobilizing","active"]) await E.transition(M,id,next,"mock://auth","Limited advisory commencement");
    await E.review(M,id,{kind:"monthly",scheduledAt:new Date().toISOString(),calendarReference:"",summary:"Authorized advisory service delivered and criteria covered",customerFeedback:"Customer acknowledgement",nextActions:"None",participants:["customer"],evidence:"mock://advisory-acceptance",comment:"Customer service acceptance"});
    const current=await E.get(M,id), o=first(current.obligations), r=first(current.workspace.reviews);
    await E.mapObligation(M,id,{obligationId:o.id,deliverableIds:[],milestoneIds:[],workstreamIds:[],reviewIds:[r.id],coverage:o.criteria,evidence:["mock://advisory-acceptance"],comment:"Evidence covers advisory criteria"});
    await freshReview(id); await E.transition(M,id,"completion_review","mock://request","Review closure"); const result=await E.complete(A,id,completionInput);
    expect(result.engagement.status).toBe("completed"); expect(result.completion?.deliverables).toHaveLength(0);
  });
});

describe("F02 current material-state completion authorization", () => {
  it("80-minute review cannot authorize a subsequent 180-minute not-achieved result", async () => {
    await readyCompletion(); const review=first((await E.get(M,HOTEL)).workspace.reviews);
    await E.measure(M,HOTEL,O,observation(180),"not_achieved","Actual 180 minutes; customer must standardize source inputs");
    await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("stale");
    const result=await E.get(M,HOTEL); expect(result.staleReviewIds).toContain(review.id); expect(first(result.workspace.outcomes).status).toBe("not_achieved");
    await freshReview(); const closed=await E.complete(A,HOTEL,completionInput); expect(closed.completion?.outcomes[0]?.status).toBe("not_achieved");
    expect(closed.completion?.outcomes[0]?.measurements.map((m) => m.value)).toEqual([80,180]);
  });
  it("applied scope amendment stales a completion review",async() => {
    await readyCompletion(); await scopeChange(); const c=first((await E.get(M,HOTEL)).workspace.changes);
    await E.approveChange(A,HOTEL,c.id,"approved","mock://auth","Independent approval"); await E.applyChange(A,HOTEL,c.id);
    await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("stale");
  });
  it("new independent measurement verification stales the reviewed state",async() => {
    await readyCompletion(); const m=first(first((await E.get(M,HOTEL)).workspace.outcomes).measurements);
    await E.verifyMeasurement(A,HOTEL,O,m.id,"mock://verification","Reviewed actual measurement");
    await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("stale");
  });
  it("changed outstanding responsibilities require fresh review",async() => {
    await readyCompletion(); await expect(E.complete(A,HOTEL,{...completionInput,outstandingResponsibilities:"A different customer responsibility"})).rejects.toThrow("reviewed state");
  });
  it("nonmaterial assignment acknowledgement does not stale review",async() => {
    await readyCompletion(); const lead=(await E.get(M,HOTEL)).workspace.assignments.find((a) => a.userId===M.user.id); if(!lead) throw Error("Missing lead");
    await E.acknowledge(M,HOTEL,lead.id); expect((await E.complete(A,HOTEL,completionInput)).engagement.status).toBe("completed");
  });
  it("state changes during completion await reject the atomic commitment",async() => {
    await readyCompletion(); deliveryControls.latencyMs=25; const pending=E.complete(A,HOTEL,completionInput); deliveryControls.latencyMs=0;
    await E.measure(M,HOTEL,O,observation(180),"not_achieved","Changed during completion await");
    await expect(pending).rejects.toThrow("changed"); expect((await E.get(M,HOTEL)).completion).toBeNull();
  });
  it("concurrent completion creates exactly one immutable snapshot",async() => {
    await readyCompletion(); const results=await Promise.allSettled([E.complete(A,HOTEL,completionInput),E.complete(A,HOTEL,completionInput)]);
    expect(results.filter((r) => r.status==="fulfilled")).toHaveLength(1); const c=(await E.get(A,HOTEL)).completion; expect(c?.id).toBe(`completion_${HOTEL}`);
    expect((await E.complete(A,HOTEL,completionInput)).completion).toEqual(c);
  });
  it("a stale review remains stale after restoration",async() => {
    const f=faults(); await readyCompletion(); await E.measure(M,HOTEL,O,observation(180),"not_achieved","Unmet target documented");
    store.attach(f.backend); await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("stale"); expect(store.persistence().quarantined).toBe(0);
  });
});

describe("F03 service-layer recursive commercial projection", () => {
  it.each([R,P])("redacts INR 999999 amendment data for $user.id",async(caller) => {
    const terms=first((await E.get(M,HOTEL)).scopes).terms;
    await scopeChange({...terms,amount:999999,commercialBasis:"Restricted basis 999999"});
    const canonicalBefore=canonical(first(store.table("deliveryWorkspaces")));
    const view=await E.get(caller,HOTEL); expect(view.commercialVisible).toBe(false);
    expect(JSON.stringify(view)).not.toContain("999999"); expect(view.initiation).toBeNull(); expect(view.completion).toBeNull();
    expect(JSON.stringify(await E.list(caller))).not.toContain("999999");
    expect(canonical(first(store.table("deliveryWorkspaces")))).toBe(canonicalBefore);
  });
  it("commercial administrator retains exact required commercial information",async() => {
    const terms=first((await E.get(M,HOTEL)).scopes).terms; await scopeChange({...terms,amount:999999,commercialBasis:"Restricted basis"});
    const v=await E.get(A,HOTEL); expect(first(v.workspace.changes).terms.amount).toBe(999999); expect(first(v.workspace.changes).commercialImpact).toContain("999999");
  });
  it("embedded review state never bypasses noncommercial projection",async() => {
    await readyCompletion(); const canonicalReview=first(first(store.table("deliveryWorkspaces")).reviews); expect(JSON.stringify(canonicalReview.binding)).toContain("commercialBasis");
    const v=await E.get(R,HOTEL); expect(first(v.workspace.reviews).binding).toBeUndefined(); expect(v.scopes).toEqual([]); expect(JSON.stringify(v.workspace.reviews)).not.toContain("commercialBasis");
  });
  it("completed report service data is suppressed without commercial authority",async() => {
    await readyCompletion(); await E.complete(A,HOTEL,completionInput); const v=await E.get(R,HOTEL);
    expect(v.completion).toBeNull(); expect(v.initiation).toBeNull(); expect(v.commercialVisible).toBe(false);
  });
  it("cross-organization caller cannot retrieve commercial or operational data",async() => {
    await expect(E.get({user:{...A.user,organizationId:"org_other"}},HOTEL)).rejects.toThrow();
  });
});

describe("F04 outcome ownership and operational scope", () => {
  it("rejects u_pro assigning an outcome to pro_rohan",async() => {
    const count=first(store.table("deliveryWorkspaces")).outcomes.length;
    await expect(E.outcome(P,HOTEL,definition())).rejects.toThrow(); expect(first(store.table("deliveryWorkspaces")).outcomes).toHaveLength(count);
  });
  it("self-owned restricted outcome remains readable and measurable",async() => {
    const v=await E.outcome(P,HOTEL,definition({ownerProfessionalId:"pro_ananya"})), o=v.workspace.outcomes.at(-1); if(!o) throw Error("Outcome not readable");
    await E.measure(P,HOTEL,o.id,observation(80),"partially_achieved","Remaining limitation"); expect((await E.get(P,HOTEL)).workspace.outcomes.find((r) => r.id===o.id)?.measurements).toHaveLength(1);
  });
  it.each(["pro_missing","pro_liam"])("rejects unavailable or unrelated owner %s",async(ownerProfessionalId) => {
    await expect(E.outcome(M,HOTEL,definition({ownerProfessionalId}))).rejects.toThrow("not part");
  });
  it("restricted specialist cannot select engagement-wide scope",async() => {
    await expect(E.outcome(P,HOTEL,definition({ownerProfessionalId:"pro_ananya",workstreamId:""}))).rejects.toThrow();
  });
  it("unrelated workstream cannot broaden specialist outcome scope",async() => {
    const v=await E.workstream(M,HOTEL,{name:"Unrelated work",description:"",ownerProfessionalId:"pro_rohan",start:"2026-11-24",end:"2026-12-04",dependencies:[]}), ws=v.workspace.workstreams.at(-1); if(!ws) throw Error("No stream");
    await expect(E.outcome(P,HOTEL,definition({ownerProfessionalId:"pro_ananya",workstreamId:ws.id}))).rejects.toThrow();
  });
  it("administrator reassignment preserves legitimate historical authorship",async() => {
    const f=faults(), v=await E.outcome(P,HOTEL,definition({ownerProfessionalId:"pro_ananya"})), o=v.workspace.outcomes.at(-1); if(!o) throw Error("No outcome");
    await E.reassignOutcome(A,HOTEL,o.id,"pro_rohan",STREAM,"mock://assign","Authorized ownership change"); store.attach(f.backend);
    const restored=(await E.get(M,HOTEL)).workspace.outcomes.find((r) => r.id===o.id); expect(restored?.createdBy).toBe("u_pro"); expect(restored?.ownerProfessionalId).toBe("pro_rohan");
  });
  it("suspension during awaited creation rejects without a new persisted outcome",async() => {
    deliveryControls.latencyMs=25; const count=first(store.table("deliveryWorkspaces")).outcomes.length; const pending=E.outcome(P,HOTEL,definition({ownerProfessionalId:"pro_ananya"}));
    store.replace("networkProfiles",store.table("networkProfiles").map((p) => p.id==="pro_ananya"?{...p,status:"suspended"}:p));
    await expect(pending).rejects.toThrow(); expect(first(store.table("deliveryWorkspaces")).outcomes).toHaveLength(count);
  });
});

describe("F05 valid measurement domains and timestamp instants", () => {
  it.each(["baseline","target"] as const)("rejects negative duration %s",async(field) => {
    await expect(E.outcome(M,HOTEL,definition({[field]:-100}))).rejects.toThrow("domain");
  });
  it("negative 100 reporting minutes never becomes achieved or 183 percent improvement",async() => {
    await expect(E.measure(M,HOTEL,O,observation(-100),"achieved","")).rejects.toThrow("domain");
    expect(improvement(first((await E.get(M,HOTEL)).workspace.outcomes),-100)).toBeNull(); expect(first((await E.get(M,HOTEL)).workspace.outcomes).measurements).toHaveLength(0);
  });
  it("offset timestamp representing an actual future observation is rejected",async() => {
    const future=new Date(Date.now()+9*60*60*1000).toISOString(); const misleading=future.replace("Z","-09:00");
    await expect(E.measure(M,HOTEL,O,observation(50,misleading),"achieved","")).rejects.toThrow("future");
  });
  it.each(["2026-02-30T10:00:00Z","2025-02-29T10:00:00Z","2026-11-24T24:00:00Z","2026-11-24T10:61:00Z","2026-11-24T10:00:00+15:00","2026-11-24T10:00:00+14:01","2026-11-24T10:00:00+05:60"])("rejects impossible timestamp %s", (timestamp) => expect(() => timestampInstant(timestamp)).toThrow());
  it("equivalent timestamps with different offsets normalize to the same instant",() => {
    expect(timestampInstant("2026-11-23T10:00:00Z")).toBe(timestampInstant("2026-11-23T15:30:00+05:30"));
    expect(timestampInstant("2024-02-29T10:00:00Z")).toBe(Date.parse("2024-02-29T10:00:00Z"));
  });
  it.each([
    ["count",1.5,0,null,true], ["percentage",101,0,100,false], ["percentage",-1,0,100,false], ["duration",-1,0,null,false], ["signed",Infinity,null,null,false], ["signed",NaN,null,null,false], ["bounded",11,0,10,false],
  ] as const)("rejects invalid %s value %s",(kind,value,minimum,maximum,integer) => {
    const metric: MeasurementDefinition={kind,unit:"units",direction:"increase",minimum,maximum,integer,comparison:"absolute"}; expect(() => validateMetric(metric,value)).toThrow();
  });
  it("legitimate signed financial measurements remain valid without misleading relative improvement",async() => {
    const v=await E.outcome(M,HOTEL,definition({unit:"INR",baseline:-120,baselineDescription:"Signed net profit",target:-60,direction:"increase",measurementDefinition:{kind:"currency",unit:"INR",direction:"increase",minimum:null,maximum:null,integer:false,comparison:"absolute"}}));
    const o=v.workspace.outcomes.at(-1); if(!o) throw Error("No financial outcome");
    const measured=await E.measure(M,HOTEL,o.id,observation(-40),"achieved",""); expect(measured.workspace.outcomes.at(-1)?.status).toBe("achieved"); expect(improvement(o,-40)).toBeNull();
  });
  it("percentage-point comparisons do not display relative percentage improvement",() => {
    const metric=metricFor({type:"quantitative",unit:"%",direction:"increase"}); expect(metric.comparison).toBe("percentage_points");
  });
  it("incompatible units cannot be compared",() => expect(() => validateMetric(metricFor({type:"quantitative",unit:"minutes",direction:"decrease"}),80,"hours")).toThrow("units"));
  it("qualitative observations cannot fabricate numeric improvement",async() => {
    const v=await E.outcome(M,HOTEL,definition({type:"qualitative",unit:"",direction:"qualitative",baseline:null,target:null,baselineDescription:"Confidence initially low"})); const o=v.workspace.outcomes.at(-1); if(!o) throw Error("No qualitative outcome");
    await expect(E.measure(M,HOTEL,o.id,observation(1),"achieved","")).rejects.toThrow("fabricated");
    expect(improvement(o,null)).toBeNull();
  });
  it("valid historical observation can be recorded",async() => {
    const v=await E.measure(M,HOTEL,O,observation(80,"2026-11-23T15:30:00+05:30"),"partially_achieved","Observed yesterday"); expect(first(first(v.workspace.outcomes).measurements).observedAt).toBe("2026-11-23T15:30:00+05:30");
  });
});

describe("F06 exact immutable measurement, baseline and review content", () => {
  async function verified() {
    await E.measure(M,HOTEL,O,observation(80),"partially_achieved","Remaining source limitations");
    const m=first(first((await E.get(M,HOTEL)).workspace.outcomes).measurements);
    await E.verifyMeasurement(A,HOTEL,O,m.id,"mock://verify","Independent administrator verification");
    await E.review(M,HOTEL,{kind:"monthly",scheduledAt:new Date().toISOString(),calendarReference:"mock://calendar",summary:"120 baseline and 80 actual reviewed",customerFeedback:"Partial",nextActions:"Source cleanup",participants:["customer"],evidence:"mock://review",comment:"Exact measured content reviewed"});
    return m;
  }
  it("corruption from baseline 120 to 600 and verified 80 to 1 is quarantined without re-signing",async() => {
    const f=faults(); await verified(); const saved=f.saved(); const w=saved.tables.deliveryWorkspaces[0]; w.outcomes[0].baseline=600; w.outcomes[0].measurements[0].value=1;
    f.backend.write(STORAGE_KEY,JSON.stringify(saved)); store.attach(f.backend);
    expect(store.table("deliveryWorkspaces").some((r) => r.engagementId===HOTEL)).toBe(false); expect(f.backend.read(QUARANTINE_KEY)).toContain('"value":1');
    expect((await E.get(M,"delivery_completed")).completion).not.toBeNull();
  });
  it.each(["baselineId","baselineNumber","baselineValue","baselineUnit","definition","measurementId","value","timestamp","evidence","verifier","verificationDecision","verificationBinding","reviewBinding","unknownContract","strippedContract"])("quarantines altered %s while valid siblings survive",async(field) => {
    const f=faults(); await verified(); const saved=f.saved(), w=saved.tables.deliveryWorkspaces[0], o=w.outcomes[0], b=o.evidenceHistory.baselines[0], d=o.evidenceHistory.definitions[0], m=o.measurements[0];
    switch(field) {
      case "baselineId": b.id="altered-baseline"; break;
      case "baselineNumber": b.number=2; break;
      case "baselineValue": b.value=600; break;
      case "baselineUnit": b.unit="hours"; break;
      case "definition": d.target=1; break;
      case "measurementId": m.id="altered-measurement"; break;
      case "value": m.value=1; break;
      case "timestamp": m.observedAt="2026-11-23T10:00:00Z"; break;
      case "evidence": m.evidence=["mock://altered-evidence"]; break;
      case "verifier": m.verification.by="u_reviewer"; break;
      case "verificationDecision": m.verificationBinding.decision="rejected"; break;
      case "verificationBinding": m.verificationBinding.measurementValue="altered-value"; break;
      case "reviewBinding": w.reviews[0].outcomeEvidence[0].measurements[0].value=1; break;
      case "unknownContract": m.binding.integrityContract="unknown/3"; break;
      case "strippedContract": delete m.binding.integrityContract; break;
    }
    f.backend.write(STORAGE_KEY,JSON.stringify(saved)); store.attach(f.backend);
    expect(store.table("deliveryWorkspaces").some((r) => r.engagementId===HOTEL)).toBe(false); expect(store.table("deliveryWorkspaces").some((r) => r.engagementId==="delivery_distribution")).toBe(true); expect(f.backend.read(QUARANTINE_KEY)).toBeTruthy();
  });
  it("baseline correction appends a new authorized version and retains exact historical review values",async() => {
    const m=await verified(); const before=await E.get(M,HOTEL), review=first(before.workspace.reviews);
    await E.correctBaseline(A,HOTEL,O,{value:130,description:"Corrected sampling period",evidence:["mock://new-baseline"],reason:"Original sampling period was incomplete",approvalEvidence:"mock://correction-approval"});
    const after=await E.get(M,HOTEL), o=first(after.workspace.outcomes); expect(o.evidenceHistory?.baselines.map((b) => b.value)).toEqual([120,130]); expect(first(o.measurements).id).toBe(m.id);
    expect(first(after.workspace.reviews)).toEqual(review); expect(review.outcomeEvidence?.[0]?.baseline).toBe(120); expect(review.outcomeEvidence?.[0]?.measurements[0]?.value).toBe(80);
    expect(workspaceProblems(first(store.table("deliveryWorkspaces")))).toEqual([]);
  });
  it("superseding observation requires provenance and never inherits verification",async() => {
    const m=await verified(); const v=await E.measure(M,HOTEL,O,observation(90),"partially_achieved","Corrected sampling observation",{supersedesId:m.id,reason:"Corrected sampling"}); const ms=first(v.workspace.outcomes).measurements;
    expect(ms).toHaveLength(2); expect(ms[1]?.verification).toBeNull(); expect(ms[1]?.binding?.supersedesId).toBe(m.id); expect(ms[0]?.verification?.by).toBe("u_admin");
  });
});

describe("F07 commencement authorization governs the whole lifecycle", () => {
  it.each(["authorized","mobilizing","active","on_hold","completion_review","completed"])("missing commencement authorization in %s is quarantined",(status) => {
    const b=corrupt((saved) => { const w=saved["tables"].deliveryWorkspaces[0], e=saved["tables"].engagements.find((e: {id:string}) => e.id===HOTEL); w.authorization=null; e.status=status; });
    expect(store.table("deliveryWorkspaces").some((w) => w.engagementId===HOTEL)).toBe(false); expect(b.read(QUARANTINE_KEY)).toContain("authorization");
    expect(store.table("deliveryWorkspaces").some((w) => w.engagementId==="delivery_completed")).toBe(true);
  });
  it.each(["engagement","organization","initiation","scope","evidence","unknownContract","strippedContract"])("altered authorization %s fails closed",(field) => {
    corrupt((saved) => { const a=saved["tables"].deliveryWorkspaces[0].authorization;
      if(field==="engagement") a.engagementId="delivery_distribution";
      if(field==="organization") a.organizationId="org_other";
      if(field==="initiation") a.initiationId="other-initiation";
      if(field==="scope") a.scopeId="other-scope";
      if(field==="evidence") a.evidence="mock://altered-approval";
      if(field==="unknownContract") a.integrityContract="unknown";
      if(field==="strippedContract") delete a.integrityContract;
    }); expect(store.table("deliveryWorkspaces").some((w) => w.engagementId===HOTEL)).toBe(false);
  });
  it("live authorization removal blocks completion and other governed operations",async() => {
    await readyCompletion(); const rows=store.table("deliveryWorkspaces"); store.replace("deliveryWorkspaces",rows.map((w) => w.engagementId===HOTEL?{...w,authorization:null}:w));
    await expect(E.complete(A,HOTEL,completionInput)).rejects.toThrow("authorization"); await expect(E.review(M,HOTEL,{kind:"completion",scheduledAt:new Date().toISOString(),calendarReference:"",summary:"Attempt",customerFeedback:"",nextActions:"None",participants:["customer"],evidence:"mock://review",comment:"Attempt"})).rejects.toThrow("authorization");
  });
  it("preauthorization cancellation legitimately has no commencement evidence",async() => {
    const f=faults(), v=await E.create(M,creation()); await E.transition(M,v.engagement.id,"cancelled","mock://cancel","Cancelled before authorization"); store.attach(f.backend);
    expect((await E.get(M,v.engagement.id)).workspace.authorization).toBeNull(); expect((await E.get(M,v.engagement.id)).engagement.status).toBe("cancelled");
  });
  it("postauthorization cancellation preserves original commencement evidence",async() => {
    const before=(await E.get(M,HOTEL)).workspace.authorization; await E.transition(M,HOTEL,"cancelled","mock://cancel","Cancelled after commencement"); expect((await E.get(M,HOTEL)).workspace.authorization).toEqual(before);
  });
  it("completion embeds exact original authorization and original scope",async() => {
    await readyCompletion(); const before=await E.get(A,HOTEL); const after=await E.complete(A,HOTEL,completionInput);
    expect(after.completion?.authorization).toEqual(before.workspace.authorization); expect(after.completion?.scopes[0]).toEqual(before.scopes[0]); expect(after.completion?.integrityContract).toBe(STRONG_CONTRACT);
  });
});

describe("genuine released history and strengthened durability", () => {
  it("genuine /1 service history stays unchanged and history-only across repeated reloads",async() => {
    const b=memoryBackend(); b.write(STORAGE_KEY,JSON.stringify(history.envelope));
    for(let reload=0;reload<3;reload++) {
      store.attach(b); const expected=history.envelope.tables.deliveryWorkspaces;
      for(const w of expected) { const actual=store.table("deliveryWorkspaces").find((r) => r.id===w.id); expect(actual).toEqual(w); expect((await E.get(A,w.engagementId)).assurance).toBe("historical_only"); }
      await expect(E.complete(A,HOTEL,completionInput)).resolves.toMatchObject({assurance:"historical_only"});
      await expect(E.measure(M,"delivery_distribution","outcome_delivery_distribution",observation(),"in_progress","")).rejects.toThrow("revalidation");
    }
    expect(store.persistence().quarantined).toBe(0);
  });
  it("a stripped current workspace marker never grants historical assurance",() => {
    corrupt((saved) => { delete saved["tables"].deliveryWorkspaces[0].integrityContract; }); expect(store.table("deliveryWorkspaces").some((w) => w.engagementId===HOTEL)).toBe(false);
  });
  it.each(["mapping","baseline","measurement","verification","review"] as const)("failed %s durability rolls back and permits safe reload/retry",async(kind) => {
    const f=faults();
    if(kind==="verification") await E.measure(M,HOTEL,O,observation(),"partially_achieved","Remaining limitations");
    const prior=canonical(first(store.table("deliveryWorkspaces")));
    const run=async() => {
      if(kind==="mapping") return map();
      if(kind==="baseline") return E.correctBaseline(A,HOTEL,O,{value:130,description:"Corrected baseline",evidence:["mock://baseline"],reason:"Corrected sampling",approvalEvidence:"mock://approve"});
      if(kind==="measurement") return E.measure(M,HOTEL,O,observation(),"partially_achieved","Actual partial result");
      if(kind==="verification") {const m=first(first((await E.get(M,HOTEL)).workspace.outcomes).measurements); return E.verifyMeasurement(A,HOTEL,O,m.id,"mock://verify","Independent verification");}
      return E.review(M,HOTEL,{kind:"monthly",scheduledAt:new Date().toISOString(),calendarReference:"",summary:"Recorded review",customerFeedback:"",nextActions:"None",participants:["customer"],evidence:"mock://review",comment:"Monthly review"});
    };
    f.fail((key) => key===STORAGE_KEY); await expect(run()).rejects.toThrow("save"); expect(canonical(first(store.table("deliveryWorkspaces")))).toBe(prior);
    f.repair(); store.attach(f.backend); await run(); const after=first(store.table("deliveryWorkspaces")); expect(contentValue(after)).not.toBe(contentValue(JSON.parse(prior)));
    expect(workspaceProblems(after)).toEqual([]);
  });
});