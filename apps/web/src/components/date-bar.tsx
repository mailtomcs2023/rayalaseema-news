import { EPAPER_URL } from "@/lib/epaper-url";

export function DateBar() {
  const now = new Date();
  const teluguDate = now.toLocaleDateString("te-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const englishDate = now.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-gray-900 text-white py-1.5">
      <div className="container-news flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="font-telugu">{teluguDate}</span>
          <span className="text-gray-400">|</span>
          <span>{englishDate}</span>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <a href={EPAPER_URL} className="hover:text-primary-300 transition-colors">ePaper</a>
          <span className="text-gray-600">|</span>
          <a href="#" className="hover:text-primary-300 transition-colors">App Download</a>
          <span className="text-gray-600">|</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Follow:</span>
            {["Fb", "Tw", "Ig", "Yt"].map((s) => (
              <a key={s} href="#" className="hover:text-primary-300 transition-colors">{s}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
