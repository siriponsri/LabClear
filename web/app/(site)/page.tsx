import { getT } from "@/lib/i18n/server";
import { getCommon, getSources, packageGroups } from "@/lib/site-data";
import { ChecksSection, Closing, DemoSection, Hero, PackagesSection, PlansSection, PrivacySection, SourcesSection } from "@/components/landing/Sections";
import "@/app/styles/landing.css";

/* LabClear home: Thai-first landing with the R3F DNA hero (loaded client-side after first paint). */
export default async function Home() {
  const [tx, common, sources] = await Promise.all([getT(), getCommon(), getSources()]);
  const g = packageGroups(common);
  return (
    <div className="lc-landing">
      <Hero {...tx} total={g.total} sourceCount={common.sources.count} />
      <DemoSection {...tx} records={sources.records} />
      <ChecksSection {...tx} records={sources.records} />
      <SourcesSection {...tx} common={common} records={sources.records} />
      <PackagesSection {...tx} common={common} ladder={g.ladder} follow={g.follow} minPrice={g.minPrice} />
      <PlansSection {...tx} common={common} org={g.org} />
      <PrivacySection {...tx} />
      <Closing {...tx} />
    </div>
  );
}
