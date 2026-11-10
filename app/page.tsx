import Hero from "@/components/Hero";
import AboutUs from "@/components/AboutUs";
import EventGrid from "@/components/EventGrid";
import Testimonials from "@/components/Testimonials";
import GeneralInfo from "@/components/GeneralInfo";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <AboutUs />
      <EventGrid />
      <Testimonials />
      <GeneralInfo />
      <Footer />
    </main>
  );
}
