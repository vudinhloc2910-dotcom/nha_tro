/** Logo của app: ô vuông bo góc màu xanh, trong có ngôi nhà. Dùng chung cho thanh trên, trang đăng nhập và hóa đơn. */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="Logo nhà trọ">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4aa3f5" />
          <stop offset="1" stopColor="#1f4a87" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-g)" />
      <path d="M9.5 23 24 11l14.5 12" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 21.5V36h20V21.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="21" y="27" width="6" height="9" rx="1.2" fill="#fbbf24" />
    </svg>
  );
}

/** Logo kèm tên, dùng ở thanh trên và trang đăng nhập. */
export function Logo({ size = 34, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className={`block text-[15px] font-extrabold tracking-tight ${light ? "text-white" : "text-brand-900"}`}>Nhà Trọ</span>
        <span className={`block text-[10px] font-medium uppercase tracking-[0.14em] ${light ? "text-brand-100" : "text-brand-500"}`}>Quản lý</span>
      </span>
    </span>
  );
}
