import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Admin } from "./pages/Admin";
import { CampaignDetail } from "./pages/CampaignDetail";
import { Campaigns } from "./pages/Campaigns";
import { Foundation } from "./pages/Foundation";
import { Home } from "./pages/Home";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { MyDonations } from "./pages/MyDonations";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="campanas" element={<Campaigns />} />
          <Route path="campanas/:id" element={<CampaignDetail />} />
          <Route path="como-funciona" element={<HowItWorksPage />} />
          <Route path="fundacion" element={<Foundation />} />
          <Route path="mis-donaciones" element={<MyDonations />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
