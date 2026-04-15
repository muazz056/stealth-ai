import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-black dark:text-white mb-4">About Interview Assist</h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400">
            Empowering candidates with AI-powered interview preparation
          </p>
        </div>

        {/* Story Section */}
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 mb-12">
            <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-4">Our Mission</h2>
            <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              Interview Assist was created to level the playing field in technical interviews. We believe that
              every candidate deserves access to the same preparation tools and resources, regardless of their background.
            </p>
            <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
              Our AI-powered assistant provides real-time support during live interviews, helping you showcase
              your best self with confidence and clarity.
            </p>
          </div>

          {/* Key Features */}
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-6">Why Interview Assist?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ValueCard
                icon="🎯"
                title="Focused on Results"
                description="Get instant, relevant answers tailored to your resume and the job you're interviewing for."
              />
              <ValueCard
                icon="🔒"
                title="Privacy First"
                description="Your data stays on your device. No cloud storage, no tracking, no data collection."
              />
              <ValueCard
                icon="⚡"
                title="Lightning Fast"
                description="Streaming AI responses in seconds. No waiting, no delays during critical moments."
              />
              <ValueCard
                icon="🎓"
                title="Learn & Improve"
                description="Review your interview history to identify patterns and improve for next time."
              />
            </div>
          </div>

          {/* Technology Stack */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 mb-12">
            <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-6">Technology</h2>
            <div className="space-y-4">
              <TechItem
                name="Electron"
                description="Cross-platform desktop application framework"
              />
              <TechItem
                name="React + TypeScript"
                description="Modern UI with type safety"
              />
              <TechItem
                name="Google Speech API"
                description="Real-time voice transcription"
              />
              <TechItem
                name="Multi-AI Support"
                description="Gemini, OpenAI, Claude, Groq"
              />
              <TechItem
                name="MongoDB"
                description="Cloud database for conversation history"
              />
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-4">Ready to ace your next interview?</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              Start with 10 free tokens. No credit card required.
            </p>
            <Link
              to="/service"
              className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-lg font-bold transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105 transform"
            >
              🚀 Get Started
            </Link>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

interface ValueCardProps {
  icon: string;
  title: string;
  description: string;
}

const ValueCard: React.FC<ValueCardProps> = ({ icon, title, description }) => (
  <div className="bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-xl p-6 hover:border-blue-500/50 transition-all">
    <div className="text-4xl mb-3">{icon}</div>
    <h3 className="text-xl font-bold text-black dark:text-white mb-2">{title}</h3>
    <p className="text-slate-600 dark:text-slate-400 text-sm">{description}</p>
  </div>
);

interface TechItemProps {
  name: string;
  description: string;
}

const TechItem: React.FC<TechItemProps> = ({ name, description }) => (
  <div className="flex items-start gap-3">
    <span className="text-blue-500 text-xl flex-shrink-0">▪</span>
    <div>
      <h4 className="font-bold text-black dark:text-white">{name}</h4>
      <p className="text-slate-600 dark:text-slate-400 text-sm">{description}</p>
    </div>
  </div>
);

export default AboutPage;
