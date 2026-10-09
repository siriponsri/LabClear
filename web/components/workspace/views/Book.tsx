"use client";
/* Request an appointment: package, center, date and an available half-hour slot (POST /bookings).
   The request holds the slot until our team confirms it; payment opens after confirmation. */
import { useMemo, useRef, useState } from "react";
import { bangkokDate, longDate, money } from "@/lib/format";
import { useWorkspace } from "../context";
import { ActionButton, Empty, Field } from "../ui";
import { errorText, isSunday, LoadError, Loading, newKey, SlotPicker, useLoad } from "./shared";

/** The next `n` open days (Monday to Saturday) from Bangkok today. */
function openDays(n: number) {
  const out: string[] = [];
  for (let i = 0; out.length < n && i < 31; i++) {
    const d = bangkokDate(i);
    if (!isSunday(d)) out.push(d);
  }
  return out;
}

export function BookView() {
  const { api, t, tf, lang, user, params, business, navigate, notice, refresh, requireAccount, ask } = useWorkspace();
  const biz = useLoad(() => business());
  const bookable = useMemo(() => (biz.data?.catalog.packages || []).filter((p) => p.segment === "individual" && !p.staff_review_required && p.active !== false), [biz.data]);

  const wantPkg = params.package_id || params.package || "";
  const [pkgId, setPkgId] = useState(wantPkg);
  const [branchId, setBranchId] = useState(params.branch_id || params.branch || "");
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date : "");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  const [slotVersion, setSlotVersion] = useState(0);
  const attempt = useRef({ sel: "", key: "" });

  // Derived selection: fall back to the first package and drop a center that does not offer it.
  const pkg = bookable.find((p) => p.id === pkgId) || bookable[0];
  const centers = (biz.data?.branches || []).filter((b) => !pkg || pkg.branch_ids.includes(b.id));
  const branch = centers.find((b) => b.id === branchId);
  const center = branch?.id || "";
  const quick = useMemo(() => openDays(6), []);
  const min = bangkokDate(0);
  const max = bangkokDate(30);

  const keyFor = (sel: string) => {
    if (attempt.current.sel !== sel) attempt.current = { sel, key: newKey() };
    return attempt.current.key;
  };

  const submit = async () => {
    setErr("");
    if (!pkg || !center || !date || !time) {
      setErr(t("Choose a package, a center, a date and an available time."));
      return;
    }
    if (!user?.registered) {
      requireAccount(t("Create an account or sign in so you can follow your appointment request."));
      return;
    }
    const sel = [pkg.id, center, date, time].join("|");
    try {
      const r = await api.post("/bookings", { package_ids: [pkg.id], branch_id: center, date, time, idempotency_key: keyFor(sel) });
      attempt.current = { sel: "", key: "" };
      notice(tf("Request sent for {date} at {time}. We will notify you when it is confirmed.", { date: longDate(r.data.date, lang), time: r.data.time }));
      await refresh().catch(() => null);
      navigate("bookings");
    } catch (e) {
      setErr(errorText(t, e));
      if ((e as { code?: string }).code === "slot_full") {
        setTime("");
        setSlotVersion((v) => v + 1);
      }
    }
  };

  const intro = (
    <div className="view-intro">
      <h2>{t("Request an appointment")}</h2>
      <p>{t("Choose a package, center and time. Your request holds the slot until our team confirms it; payment opens after confirmation.")}</p>
    </div>
  );

  if (biz.error) return (<div>{intro}<LoadError error={biz.error} retry={() => biz.reload()} /></div>);
  if (!biz.data) return (<div>{intro}<Loading rows={2} /></div>);
  if (!bookable.length)
    return (
      <div>
        {intro}
        <Empty
          title={t("No packages can be booked directly right now")}
          actions={
            <button type="button" className="btn sm primary" onClick={() => ask(t("I would like help booking a health check."), true)}>
              {t("Ask the assistant")}
            </button>
          }
        >
          {t("Ask our team for help.")}
        </Empty>
      </div>
    );

  return (
    <div>
      {intro}
      <div className="book-grid">
        <form className="form-grid" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field label={t("Health check")} id="book-pkg">
            <select
              id="book-pkg"
              className="input"
              value={pkg?.id || ""}
              onChange={(e) => {
                setPkgId(e.target.value);
                setTime("");
                setErr("");
              }}
            >
              {bookable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price_thb)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid two">
            <Field label={t("Center")} id="book-branch">
              <select
                id="book-branch"
                className="input"
                value={center}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setTime("");
                  setErr("");
                }}
              >
                <option value="">{t("Choose a center")}</option>
                {centers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t(b.name)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field">
              <label htmlFor="book-date">{t("Date")}</label>
              <span className="hint" id="book-date-hint">
                {t("Monday to Saturday, up to 30 days ahead")}
              </span>
              <input
                id="book-date"
                className="input"
                type="date"
                min={min}
                max={max}
                required
                aria-describedby="book-date-hint"
                aria-invalid={isSunday(date) || undefined}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTime("");
                  setErr("");
                }}
              />
            </div>
          </div>
          <div className="date-chips" role="group" aria-label={t("Next open days")}>
            {quick.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={date === d}
                onClick={() => {
                  setDate(d);
                  setTime("");
                  setErr("");
                }}
              >
                {longDate(d, lang)}
              </button>
            ))}
          </div>
          <h3>{t("Time")}</h3>
          <SlotPicker branchId={center} date={date} value={time} onPick={setTime} version={slotVersion} />
          {err ? (
            <p className="field-error" role="alert">
              {err}
            </p>
          ) : null}
        </form>
        <aside className="summary" aria-label={t("Summary")}>
          <h3>{t("Summary")}</h3>
          <dl>
            <div>
              <dt>{t("Package")}</dt>
              <dd>{pkg?.name || t("Not chosen")}</dd>
            </div>
            <div>
              <dt>{t("Center")}</dt>
              <dd>{branch?.name ? t(branch.name) : t("Not chosen")}</dd>
            </div>
            <div>
              <dt>{t("Date")}</dt>
              <dd>{date ? longDate(date, lang) : t("Not chosen")}</dd>
            </div>
            <div>
              <dt>{t("Time")}</dt>
              <dd>{time ? tf("{time} Bangkok time", { time }) : t("Not chosen")}</dd>
            </div>
          </dl>
          <p className="total">{pkg ? money(pkg.price_thb) : ""}</p>
          <p className="tiny muted">{t("Simulated price from the current catalog. The server rechecks price and capacity when you send.")}</p>
          {!user?.registered ? <p className="tiny muted">{t("You will be asked to sign in before the request is sent.")}</p> : null}
          <ActionButton className="btn primary" run={submit}>
            {t("Send appointment request")}
          </ActionButton>
        </aside>
      </div>
    </div>
  );
}
