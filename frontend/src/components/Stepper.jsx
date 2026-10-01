export default function Stepper({ label, value, onChange, min = 0, max = 1e9, step = 1, prefix, disabled, decimals = 0 }) {
  const num = Number(value) || 0;
  const set = (v) => onChange(String(Math.min(max, Math.max(min, Number(v.toFixed(decimals))))));
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="stepper">
        <button type="button" disabled={disabled} onClick={() => set(num - step)} aria-label="Decrease"><i className="bi bi-dash" /></button>
        <div className="stepper-input">
          {prefix && <span>{prefix}</span>}
          <input inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <button type="button" disabled={disabled} onClick={() => set(num + step)} aria-label="Increase"><i className="bi bi-plus" /></button>
      </div>
    </div>
  );
}
