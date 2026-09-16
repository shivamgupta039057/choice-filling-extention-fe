const MiniList = ({ items, empty, render }) => {
  const rows = items.length ? items : [null];

  return (
    <ul className="mini-list">
      {rows.map((item, index) => {
        const [left, right] = item ? render(item) : [empty, ""];
        return (
          <li key={item?._id || item?.id || index}>
            <span>{left}</span>
            <span>{right}</span>
          </li>
        );
      })}
    </ul>
  );
};

export default MiniList;
