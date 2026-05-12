export default function LockBanner({ message }) {
  return (
    <div className="bg-amber-50 border-y border-amber-200 text-amber-900 text-sm px-4 py-2 text-center font-medium">
      🔒 {message}
    </div>
  );
}
