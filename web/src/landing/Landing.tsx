import "./landing.css";
import "./hero.css";
import "./sections.css";
import { Aurora } from "../shared/Aurora";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { Story } from "./Story";
import { Elder } from "./Elder";
import { Families } from "./Families";
import { Security } from "./Security";
import { FinalCta, Footer } from "./Closing";

export default function Landing() {
  return (
    <div className="ld">
      <Aurora intensity="vivid" />
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <div className="ld-page">
        <Nav />
        <main id="main" tabIndex={-1}>
          <Hero />
          <Story />
          <Elder />
          <Families />
          <Security />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
