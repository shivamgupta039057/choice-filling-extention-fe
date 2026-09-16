const StatGrid = ({ compact = false, items }) => (
  <section className={`stats${compact ? " compact" : ""}`}>
    {items.map((item) => (
      <div key={item.label}>
        <strong>{item.value}</strong>
        <span>{item.label}</span>
      </div>
    ))}
  </section>
);

export default StatGrid;
