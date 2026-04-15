import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const PricingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* Background Effects - Dark mode only */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        {/* Header */}
        <div className="text-center mb-16 md:mb-20">
          <div className="inline-block mb-4">
            <span className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-600 dark:text-blue-400 text-sm font-bold uppercase tracking-wider">
              💎 Pricing Plans
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-black dark:text-white mb-6 uppercase tracking-tight">
            Simple <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-500 dark:to-purple-500">Pricing</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-800 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your interview preparation needs.
            <br />
            <span className="text-blue-600 dark:text-blue-400 font-semibold">Start free, upgrade when you're ready.</span>
          </p>
        </div>

        {/* Pricing Cards - Column Layout (Mobile First) */}
        <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
          {/* Trial Plan */}
          <PricingCard
            name="Trial"
            price="Free"
            period=""
            description="Perfect for testing the waters"
            features={[
              '10 tokens on signup',
              'All AI providers supported',
              'Real-time voice transcription',
              'Screen analysis',
              'Resume/CV integration',
              'Basic support'
            ]}
            cta="Get Started"
            ctaLink="/service"
            popular={false}
            badge=""
          />

          {/* Pro Plan */}
          <PricingCard
            name="Pro"
            price="$29"
            period="/month"
            description="For serious interview preparation"
            features={[
              'Unlimited tokens',
              'All AI providers supported',
              'Real-time voice transcription',
              'Screen analysis',
              'Resume/CV integration',
              'Priority support',
              'Advanced shortcuts',
              'BrowseAI integration'
            ]}
            cta="Coming Soon"
            ctaLink="#"
            popular={true}
            badge="MOST POPULAR"
          />

          {/* Lifetime Plan */}
          <PricingCard
            name="Lifetime"
            price="$199"
            period="one-time"
            description="Pay once, use forever"
            features={[
              'Unlimited tokens forever',
              'All AI providers supported',
              'Real-time voice transcription',
              'Screen analysis',
              'Resume/CV integration',
              'Premium support',
              'Advanced shortcuts',
              'BrowseAI integration',
              'Future updates included',
              'No recurring fees'
            ]}
            cta="Coming Soon"
            ctaLink="#"
            popular={false}
            badge="BEST VALUE"
          />
        </div>

        {/* FAQ Section - Column Layout */}
        <div className="mt-20 max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black text-black dark:text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="flex flex-col md:flex-row md:flex-wrap gap-6">
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="What counts as a token?"
                answer="1 token = 1 question. Each AI response you receive consumes one token. New users get 10 free tokens on signup."
              />
            </div>
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="Can I upgrade my plan?"
                answer="Yes! You can upgrade to Pro or Lifetime at any time. Your tokens will be upgraded immediately."
              />
            </div>
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="Which AI providers are supported?"
                answer="We support Google Gemini, OpenAI GPT, Claude, and Groq. You'll need your own API keys."
              />
            </div>
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="Is there a refund policy?"
                answer="Yes! We offer a 30-day money-back guarantee for all paid plans. No questions asked."
              />
            </div>
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="How does stealth mode work?"
                answer="The overlay window uses advanced Windows APIs to exclude itself from screen capture, making it invisible to screen sharing."
              />
            </div>
            <div className="flex-1 min-w-[280px]">
              <FAQItem
                question="Do admins get unlimited access?"
                answer="Yes! Admin accounts have unlimited tokens and lifetime access to all features."
              />
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 md:mt-24">
          <div className="relative bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-600/10 dark:via-indigo-600/10 dark:to-purple-600/10 border border-blue-300 dark:border-blue-500/20 rounded-3xl p-10 md:p-16 backdrop-blur-sm overflow-hidden">
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-200/30 to-purple-200/30 dark:from-blue-500/5 dark:to-purple-500/5"></div>
            
            {/* Content */}
            <div className="relative text-center">
              <h2 className="text-3xl md:text-4xl font-black text-black dark:text-white mb-4">
                Ready to ace your interviews?
              </h2>
              <p className="text-slate-800 dark:text-slate-300 mb-8 md:mb-10 max-w-2xl mx-auto text-base md:text-lg">
                Start with our free trial and upgrade anytime. No credit card required.
                <br />
                <span className="text-blue-600 dark:text-blue-400 font-semibold">Get 10 free tokens to test it out!</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto">
                <Link
                  to="/service"
                  className="group relative w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl text-lg font-bold transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105 transform overflow-hidden"
                >
                  <span className="relative z-10">🚀 Start Free Trial</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  to="/contact"
                  className="w-full sm:w-auto px-8 py-4 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-slate-300 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-600 hover:border-blue-500/50 text-black dark:text-white rounded-xl text-lg font-bold transition-all hover:scale-105 transform"
                >
                  💬 Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaLink: string;
  popular: boolean;
  badge: string;
}

const PricingCard: React.FC<PricingCardProps> = ({
  name,
  price,
  period,
  description,
  features,
  cta,
  ctaLink,
  popular,
  badge
}) => (
  <div className={`group relative flex-1 min-w-[280px] bg-white dark:bg-slate-800/30 backdrop-blur-sm border ${popular ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20 lg:scale-105 lg:z-10' : 'border-slate-300 dark:border-slate-700/50'} rounded-3xl p-6 md:p-8 hover:border-blue-500/50 transition-all duration-300 flex flex-col h-full hover:scale-105 transform`}>
    {/* Gradient Background on Hover */}
    <div className={`absolute inset-0 bg-gradient-to-br ${popular ? 'from-blue-500/5 to-indigo-500/5' : 'from-slate-50 dark:from-slate-800/0 to-slate-100 dark:to-slate-700/0'} rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
    
    {/* Badge */}
    {badge && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
        <span className={`px-5 py-2 ${popular ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-indigo-600 to-purple-600'} text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-lg`}>
          {badge}
        </span>
      </div>
    )}

    {/* Content */}
    <div className="relative z-10 flex flex-col h-full">
      {/* Plan Name */}
      <h3 className="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">{name}</h3>
      <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base mb-8 min-h-[40px]">{description}</p>

      {/* Price */}
      <div className="mb-8">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-500">{price}</span>
          {period && <span className="text-slate-600 dark:text-slate-400 text-lg md:text-xl">{period}</span>}
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-4 mb-10 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3 text-slate-800 dark:text-slate-300 text-sm md:text-base">
            <span className="text-green-500 text-lg flex-shrink-0 mt-0.5">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Link
        to={ctaLink}
        className={`block w-full text-center px-6 py-4 rounded-xl font-bold text-sm md:text-base uppercase tracking-wider transition-all ${
          popular
            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 transform'
            : 'bg-slate-200 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-600/50 text-black dark:text-white border border-slate-300 dark:border-slate-600 hover:border-blue-500/50 hover:scale-105 transform'
        } ${ctaLink === '#' ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={(e) => {
          if (ctaLink === '#') {
            e.preventDefault();
          }
        }}
      >
        {cta}
      </Link>
    </div>
  </div>
);

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => (
  <div className="group bg-white dark:bg-slate-800/30 backdrop-blur-sm border border-slate-300 dark:border-slate-700/50 rounded-2xl p-6 md:p-8 hover:border-blue-500/30 transition-all hover:scale-105 transform h-full">
    <h3 className="text-black dark:text-white font-bold text-base md:text-lg mb-3 flex items-start gap-3">
      <span className="text-blue-500 dark:text-blue-400 text-xl flex-shrink-0">❓</span>
      <span>{question}</span>
    </h3>
    <p className="text-slate-800 dark:text-slate-400 text-sm md:text-base leading-relaxed pl-9">{answer}</p>
  </div>
);

export default PricingPage;
