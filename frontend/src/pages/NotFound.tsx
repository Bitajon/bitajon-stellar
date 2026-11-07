import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Esta página no existe"
        action={
          <Link to="/" className="btn-primary">
            Volver al inicio
          </Link>
        }
      >
        Revisa el enlace o vuelve al inicio para ver las campañas.
      </EmptyState>
    </div>
  );
}
