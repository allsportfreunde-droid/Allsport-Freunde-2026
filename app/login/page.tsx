import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/admin");
  }

  // Passwort-Login nur außerhalb der Produktion anbieten (Preview/lokal) –
  // damit lässt sich der Admin auf Preview-Branches ohne E-Mail-Code testen.
  const allowPasswordLogin = process.env.VERCEL_ENV !== "production";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-green-600" />
          </div>
          <CardTitle className="text-xl">Allsport Freunde 2026 e.V.</CardTitle>
          <CardDescription>
            Melde dich per Login-Link oder Code an deine E-Mail an.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm allowPasswordLogin={allowPasswordLogin} />
        </CardContent>
      </Card>
    </div>
  );
}
