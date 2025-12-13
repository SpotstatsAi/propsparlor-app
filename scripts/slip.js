/* ============================
   THREAD 8 – PARLAY SUMMARY FIX
   ============================ */

#pp-slip-summary {
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(20, 26, 48, 0.85),
    rgba(10, 12, 24, 0.85)
  );
  border: 1px solid rgba(0, 255, 180, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 0 22px rgba(0, 255, 180, 0.12);
}

/* Header alignment */
#pp-slip-summary > div:first-child {
  margin-bottom: 12px;
}

/* Grid tightening */
#pp-slip-summary [style*="grid-template-columns"] {
  gap: 12px;
}

/* Inputs consistency */
#pp-slip-summary input,
#pp-slip-summary select {
  height: 38px;
  font-size: 0.82rem;
}

/* Stake row */
#pp-slip-stake {
  text-align: center;
  font-weight: 600;
}

/* Build button sizing */
#pp-slip-build {
  height: 38px;
  font-size: 0.78rem;
  white-space: nowrap;
}

/* Estimated return section */
#pp-slip-return {
  font-size: 1.1rem;
  letter-spacing: 0.02em;
}

#pp-slip-profit {
  font-size: 0.78rem;
  opacity: 0.65;
}

/* Prevent helper text from breaking layout */
#pp-slip-summary .pp-slip-helper {
  max-width: 180px;
  line-height: 1.3;
  opacity: 0.6;
}

/* Mobile safety */
@media (max-width: 920px) {
  #pp-slip-summary {
    padding: 12px;
  }
}
