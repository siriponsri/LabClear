/*
 * The synthetic rows for the landing lab-report demo. Values are invented (and labelled so on the
 * page); every cited sentence is supported by the record it cites in the knowledge base
 * (data/seed/evidence.json). Titles, publishers and links are read live from the source list when
 * available, with these as fallbacks.
 */
import type { SourceRecord } from "@/lib/types";
import type { T, TF } from "@/lib/i18n/shared";
import type { DemoRow, DemoSource } from "./LabReportDemo";

const FALLBACK: Record<string, Omit<DemoSource, "n">> = {
  "nlm-reading-results": { title: "How to understand your lab results", publisher: "MedlinePlus · U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/" },
  "nlm-a1c": { title: "Hemoglobin A1c test", publisher: "MedlinePlus · U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/" },
  "nlm-lipids": { title: "Cholesterol levels", publisher: "MedlinePlus · U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/cholesterol-levels/" },
  "nlm-creatinine": { title: "Creatinine test", publisher: "MedlinePlus · U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/creatinine-test/" },
  "nlm-liver": { title: "Liver function tests", publisher: "MedlinePlus · U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/liver-function-tests/" },
  "siriraj-glucose-glucose-07": { title: "Siriraj Hospital: Glucose", publisher: "Siriraj Hospital", url: "https://www.si.mahidol.ac.th/th/manual/Project/pdf/glucose.pdf" },
  "siriraj-ldl-c-ldl-c-23": { title: "Siriraj Hospital: LDL-C", publisher: "Siriraj Hospital", url: "https://www.si.mahidol.ac.th/th/manual/Project/pdf/ldl-c.pdf" },
};

type Raw = {
  id: string;
  test: string;
  note: string;
  value: number;
  shown: string;
  unit: string;
  lo: number | null;
  hi: number | null;
  min: number;
  max: number;
  /** decimals printed for the range */
  dp: number;
  sentences: [string, string | null][];
};

const RAW: Raw[] = [
  {
    id: "glucose",
    test: "Glucose",
    note: "Fasting blood sugar",
    value: 101,
    shown: "101",
    unit: "mg/dL",
    lo: 70,
    hi: 99,
    min: 55,
    max: 125,
    dp: 0,
    sentences: [
      ["101 mg/dL is slightly above the 70–99 printed on this report.", null],
      ["Each laboratory has its own method and range; Siriraj's laboratory manual, for example, lists 74–99 mg/dL for people over 15.", "siriraj-glucose-glucose-07"],
      ["One value outside the range does not mean an illness; it is read together with symptoms, history and medicines.", "nlm-reading-results"],
    ],
  },
  {
    id: "hba1c",
    test: "HbA1c",
    note: "Average blood sugar",
    value: 5.4,
    shown: "5.4",
    unit: "%",
    lo: 4.0,
    hi: 5.6,
    min: 3.4,
    max: 7.0,
    dp: 1,
    sentences: [
      ["HbA1c reflects average blood sugar over roughly the past three months, unlike glucose, which is measured at one moment.", "nlm-a1c"],
      ["5.4% is within the 4.0–5.6 printed on this report.", null],
      ["Some blood conditions can affect its accuracy, so a doctor takes that into account.", "nlm-a1c"],
    ],
  },
  {
    id: "ldl",
    test: "LDL cholesterol",
    note: "Blood fats",
    value: 142,
    shown: "142",
    unit: "mg/dL",
    lo: null,
    hi: 130,
    min: 60,
    max: 190,
    dp: 0,
    sentences: [
      ["LDL carries cholesterol in the blood and is measured in a lipid panel with HDL and triglycerides.", "nlm-lipids"],
      ["142 mg/dL is above the limit of below 130 printed on this report, the same limit listed in Siriraj's laboratory manual.", "siriraj-ldl-c-ldl-c-23"],
      ["It is read with the whole lipid profile and heart-risk factors, not on its own.", "nlm-lipids"],
    ],
  },
  {
    id: "creatinine",
    test: "Creatinine",
    note: "Kidney function",
    value: 0.9,
    shown: "0.9",
    unit: "mg/dL",
    lo: 0.6,
    hi: 1.2,
    min: 0.3,
    max: 1.6,
    dp: 1,
    sentences: [
      ["Creatinine is a waste product of muscle activity that the kidneys clear from the blood; it helps assess kidney function.", "nlm-creatinine"],
      ["0.9 mg/dL is within the 0.6–1.2 printed on this report.", null],
      ["Muscle mass and diet affect it, so doctors usually read it together with eGFR.", "nlm-creatinine"],
    ],
  },
  {
    id: "alt",
    test: "ALT",
    note: "Liver enzyme",
    value: 28,
    shown: "28",
    unit: "U/L",
    lo: 0,
    hi: 40,
    min: -6,
    max: 70,
    dp: 0,
    sentences: [
      ["ALT is an enzyme measured in the liver panel.", "nlm-liver"],
      ["28 U/L is within the 0–40 printed on this report.", null],
      ["Liver results are read as a pattern with other tests and clinical information; one panel does not show the cause of an abnormal result.", "nlm-liver"],
    ],
  },
];

const pct = (v: number, min: number, max: number) => Math.round(((v - min) / (max - min)) * 1000) / 10;

export function demoRows(records: SourceRecord[], t: T, tf: TF): DemoRow[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const source = (id: string, n: number): DemoSource => {
    const r = byId.get(id);
    const f = FALLBACK[id];
    return { n, title: r?.title || f.title, publisher: r?.publisher || f.publisher, url: r?.url || f.url };
  };
  return RAW.map((r) => {
    const status: DemoRow["status"] = r.hi != null && r.value > r.hi ? "above" : r.lo != null && r.value < r.lo ? "below" : "within";
    const fmt = (v: number) => v.toFixed(r.dp);
    const range = r.lo == null ? `< ${fmt(r.hi!)}` : r.hi == null ? `> ${fmt(r.lo)}` : `${fmt(r.lo)}–${fmt(r.hi)}`;
    const order: string[] = [];
    const sentences = r.sentences.map(([text, id]) => {
      if (!id) return { text: t(text) };
      if (!order.includes(id)) order.push(id);
      return { text: t(text), cite: order.indexOf(id) + 1 };
    });
    const verdict = status === "above" ? t("Above the printed range") : status === "below" ? t("Below the printed range") : t("Within the printed range");
    const from = r.lo == null ? 0 : pct(r.lo, r.min, r.max);
    const to = r.hi == null ? 100 : pct(r.hi, r.min, r.max);
    const ticks = [
      ...(r.lo != null ? [{ at: from, label: fmt(r.lo) }] : []),
      ...(r.hi != null ? [{ at: to, label: r.lo == null ? `< ${fmt(r.hi)}` : fmt(r.hi) }] : []),
    ];
    return {
      id: r.id,
      test: r.test,
      note: t(r.note),
      value: r.shown,
      unit: r.unit,
      range,
      status,
      statusShort: status === "above" ? t("Above") : status === "below" ? t("Below") : t("Within"),
      verdict,
      rulerLabel: tf("{value} {unit} against the printed range {range}: {verdict}", { value: r.shown, unit: r.unit, range, verdict }),
      band: { from, to },
      at: pct(r.value, r.min, r.max),
      ticks,
      sentences,
      sources: order.map((id, i) => source(id, i + 1)),
    };
  });
}
