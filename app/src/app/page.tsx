import Navbar from '@/components/layout/Navbar'
import HeroSection from '@/components/layout/HeroSection'
import Features from '@/components/layout/Features'
import HowItWorks from '@/components/layout/HowItWorks'
import Pricing from '@/components/layout/Pricing'
import Footer from '@/components/layout/Footer'

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </main>
  )
}
