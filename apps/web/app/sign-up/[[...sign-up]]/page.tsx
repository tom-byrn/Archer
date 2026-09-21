import { SignUp } from "@clerk/nextjs";

// Sign-up mirrors sign-in; login methods come from the Clerk dashboard.
export default function SignUpPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6 py-12">
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-lg" />
          <span className="font-display text-[30px] leading-none text-ink">Archer</span>
        </div>
        <p className="pb-8 pt-3 text-base text-ink-2">
          Draw your architecture. Hand it to an agent.
        </p>
        <SignUp forceRedirectUrl="/" />
      </div>
    </div>
  );
}
