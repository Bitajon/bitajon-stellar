import { Compass } from "lucide-react";
import { tr } from "../lib/i18n";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title={tr("Esta página no existe", "This page doesn't exist")}
        action={
          <Link to="/" className="btn-primary">
            {tr("Volver al inicio", "Back to home")}
          </Link>
        }
      >
        {tr("Revisa el enlace o vuelve al inicio para ver las campañas.", "Check the link or go back home to see the campaigns.")}
      </EmptyState>
    </div>
  );
}
