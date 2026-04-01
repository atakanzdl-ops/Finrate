import Navbar from '@/components/layout/Navbar'
import HeroSection from '@/components/layout/HeroSection'
import HowItWorks from '@/components/layout/HowItWorks'
import Features from '@/components/layout/Features'
import Pricing from '@/components/layout/Pricing'
import Footer from '@/components/layout/Footer'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-navy-900">
      <Navbar />
      <HeroSection />
      <HowItWorks />
      <Features />
      <Pricing />
      <Footer />
    </main>
  )
}
