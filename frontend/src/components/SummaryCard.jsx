export default function SummaryCard({ title, value }) {
  return (
    <div className="bg-gray-800 shadow rounded p-4">
      <h3 className="text-gray-400">{title}</h3>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
