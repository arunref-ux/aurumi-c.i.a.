import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "@/components/app/icons";
import { OfficialLink } from "@/components/business-fit/shared";
import photo from "@/assets/business-fit-workspace.png.asset.json";
const title = "Business Fit — Aurumi C.I.A.";
const description =
  "Explore how your business systems work together and receive practical preliminary improvement guidance. No account or software purchase required.";
export const Route = createFileRoute("/business-fit/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});
function Landing() {
  return (
    <>
      <section className="fit-cover relative isolate overflow-hidden">
        <img
          src={photo.url}
          alt="Business owners reviewing their systems and working processes together"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-right"
        />
        <div className="fit-cover-wash absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-lg">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              A clearer view of your business
            </p>
            <h1 className="mt-4 text-5xl md:text-6xl">Business Fit</h1>
            <h2 className="mt-4 text-2xl md:text-3xl">
              How well do your business systems work together?
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed">
              Understand where your business can improve its processes, access to information and
              use of technology.
            </p>
            <Button asChild size="lg" className="mt-7">
              <Link to="/business-fit/start">
                Check Your Business Fit <ArrowUpRight />
              </Link>
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              5–8 minutes · No account required · No software purchase required
            </p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <div className="grid gap-7 md:grid-cols-3">
          {[
            [
              "Understand today",
              "Look at the software, manual tasks and information your business relies on.",
            ],
            [
              "Find practical opportunities",
              "Receive explainable guidance based on your own responses, not a sales score.",
            ],
            [
              "Choose your next step",
              "Keep useful systems and optionally ask a C.I.A. professional for help.",
            ],
          ].map(([name, body], i) => (
            <div key={name} className="border-t pt-5">
              <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <h2 className="mt-2 text-2xl">{name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <OfficialLink label="Learn about Aurumi C.I.A." />
          <p className="text-xs text-muted-foreground">
            Preliminary guidance · Optional consultation · No guaranteed outcomes
          </p>
        </div>
      </section>
    </>
  );
}
