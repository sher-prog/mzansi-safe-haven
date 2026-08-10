import { LifeBuoy, Phone, Clock, ExternalLink, MessageSquare } from "lucide-react";
import { shelters } from "@/data/shelters";
import { useTranslation } from "@/i18n";

const GetHelp = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" aria-hidden="true" />
          {t("getHelp.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("getHelp.subtitle")}</p>
      </div>

      {/* Emergency Banner */}
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground">{t("getHelp.emergencyBanner")}</p>
        <a
          href="tel:0800150150"
          aria-label={t("getHelp.callLabel", { name: "GBV Helpline, 0800 150 150" })}
          className="text-lg font-bold text-destructive mt-1 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-h-[48px]"
        >
          0800 150 150
        </a>
        <p className="text-xs text-muted-foreground mt-1">{t("getHelp.emergencyDetail")}</p>
      </div>

      {/* TEARS USSD — works with zero airtime/data, on any phone */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
          {t("getHelp.ussdPrompt")}
        </p>
        <a
          href="tel:*134*7355%23"
          aria-label={t("getHelp.callLabel", { name: "TEARS USSD, star 134 star 7355 hash" })}
          className="text-xl font-bold text-primary mt-1 block tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-h-[48px]"
        >
          *134*7355#
        </a>
        <p className="text-xs text-muted-foreground mt-1">{t("getHelp.ussdDetail")}</p>
      </div>

      {/* Helpline List */}
      <div className="space-y-3">
        {shelters.map((shelter) => (
          <div key={shelter.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-foreground text-sm">{shelter.name}</h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{shelter.hours}</span>
              </div>
              <p className="text-xs text-muted-foreground">{shelter.address}</p>
              <a
                href={`tel:${shelter.phone.replace(/\s/g, "")}`}
                aria-label={t("getHelp.callLabel", { name: `${shelter.name}, ${shelter.phone}` })}
                className="flex items-center gap-2 text-xs font-medium text-primary min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Phone className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{shelter.phone}</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GetHelp;
