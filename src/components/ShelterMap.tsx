import { MapPin, Phone, Clock, ExternalLink } from "lucide-react";
import { shelters } from "@/data/shelters";

const ShelterMap = () => {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Shelters & Helplines
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Verified national support organisations across South Africa.
        </p>
      </div>

      {/* Emergency Banner */}
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground">
          🚨 National GBV Helpline
        </p>
        <a
          href="tel:0800150150"
          className="text-lg font-bold text-destructive mt-1 block"
        >
          0800 150 150
        </a>
        <p className="text-xs text-muted-foreground mt-1">Free • 24/7 • Confidential</p>
      </div>

      {/* Shelter / Helpline List */}
      <div className="space-y-3">
        {shelters.map((shelter) => (
          <div
            key={shelter.id}
            className="bg-card border border-border rounded-lg p-4 space-y-2"
          >
            <h3 className="font-semibold text-foreground text-sm">{shelter.name}</h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{shelter.address} • {shelter.province}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{shelter.hours}</span>
              </div>
              <a
                href={`tel:${shelter.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 text-xs font-medium text-primary"
              >
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{shelter.phone}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShelterMap;
