export interface Shelter {
  id: string;
  name: string;
  city: string;
  province: string;
  phone: string;
  hours: string;
  address: string;
}

// Local-first v1: bundled national helplines only (rendered by GetHelp.tsx — there's
// no map, just verified numbers that work fully offline). These numbers are the same
// ones already relied on elsewhere in this app (PanicButton, onboarding).
// A vetted, regularly-updated local shelter directory should replace/extend
// this list before relying on it for specific in-person shelter referrals.
export const shelters: Shelter[] = [
  {
    id: "gbv-command-centre",
    name: "GBV Command Centre",
    city: "National",
    province: "All provinces",
    phone: "0800 150 150",
    hours: "24/7",
    address: "Toll-free, phone-based support and referrals nationwide",
  },
  {
    id: "saps-emergency",
    name: "SAPS Emergency Services",
    city: "National",
    province: "All provinces",
    phone: "10111",
    hours: "24/7",
    address: "Police emergency response nationwide",
  },
  {
    id: "tears-foundation",
    name: "TEARS Foundation",
    city: "National",
    province: "All provinces",
    phone: "0800 60 10 10",
    hours: "24/7",
    address: "Toll-free crisis support and counselling referrals",
  },
];
