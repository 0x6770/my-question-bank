import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-slate-900">
      <div className="absolute inset-0 bg-[url('/login_bg.webp')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/35 via-slate-900/20 to-slate-900/55 md:bg-gradient-to-r md:from-slate-900/35 md:via-slate-900/15 md:to-transparent" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col gap-10 px-10 py-20 md:py-40 md:px-20 md:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:py-0">
        <div className="flex flex-1 flex-col items-center gap-4 text-center text-white lg:max-w-[520px] lg:items-start lg:text-left">
          <div className="flex flex-col items-center gap-4 text-center lg:self-center">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="relative flex items-center justify-center">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-25 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.12)_48%,rgba(255,255,255,0)_78%)] blur-3xl"
                />
                <Image
                  src="/logo_no_text.png"
                  alt="MyWay Academy"
                  width={450}
                  height={400}
                  priority
                  className="h-auto w-72 max-w-[75vw] drop-shadow-sm pb-5"
                />
              </div>
              <h1 className="whitespace-nowrap text-4xl font-semibold tracking-tight md:text-5xl">
                MyWay Academy
              </h1>
            </div>
            <p className="text-4xl text-white/90 font-semibold">
              MyWay to Shine
            </p>
            <p className="pt-2 text-1xl font-bold uppercase tracking-[0.2em] text-white/90 whitespace-nowrap md:pt-5 md:text-2xl">
              <span className="inline-flex items-center divide-x-2 divide-white/50">
                <span className="px-3 first:pl-0">IB</span>
                <span className="px-3">MYP</span>
                <span className="px-3">A-Level</span>
                <span className="px-3 last:pr-0">IGCSE</span>
              </span>
            </p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[450px] lg:mx-0 lg:w-[520px]">
          <LoginForm className="w-full" />
        </div>
      </div>
    </div>
  );
}
