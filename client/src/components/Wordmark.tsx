export default function Wordmark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <span
      className={`font-display font-semibold tracking-tight text-parchment ${
        size === "lg" ? "text-5xl md:text-6xl" : "text-xl"
      }`}
    >
      Kabzaa
      <span className="text-amber">.</span>
    </span>
  );
}
