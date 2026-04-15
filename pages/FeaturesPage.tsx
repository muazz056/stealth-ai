import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const FeaturesPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-black dark:text-white mb-3 sm:mb-4">Powerful Features</h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 px-4">Everything you need to ace your interviews</p>
        </div>

        {/* Features List */}
        <div className="space-y-12 sm:space-y-20">
          <Feature
            title="🎙️ Real-Time Voice Transcription"
            description="Live speech-to-text transcription with Google Speech API. Instant and accurate."
            features={[
              "Real-time audio capture",
              "Continuous recording mode",
              "Editable transcriptions",
              "Fast and accurate processing"
            ]}
            reverse={false}
          />

          <Feature
            title="🤖 Multi-AI Provider Support"
            description="Choose your preferred AI provider. Use your own API keys for maximum control."
            features={[
              "Google Gemini 2.5 Flash",
              "OpenAI GPT-4o Mini",
              "Claude 3.5 Sonnet",
              "Groq Lightning Fast"
            ]}
            reverse={true}
          />

          <Feature
            title="👻 Complete Stealth Mode"
            description="Invisible to screen sharing applications. Uses Windows API for true stealth."
            features={[
              "Invisible to Zoom, Teams, Meet",
              "Transparent overlay window",
              "Always-on-top design",
              "Minimal floating widget"
            ]}
            reverse={false}
          />

          <Feature
            title="📄 Resume & Context Intelligence"
            description="Upload your CV and job details for personalized, context-aware answers."
            features={[
              "Parse PDFs and text files",
              "Store job descriptions",
              "Company research notes",
              "Smart context matching"
            ]}
            reverse={true}
          />

          <Feature
            title="⚡ Lightning Fast Responses"
            description="Streaming AI responses with optimized context. Get answers in seconds."
            features={[
              "Streaming text generation",
              "Smart context windows",
              "Conversation history",
              "Optimized prompts"
            ]}
            reverse={false}
          />

          <Feature
            title="🔒 Privacy First"
            description="Your data stays on your device. All AI calls are direct with your API keys."
            features={[
              "No data collection",
              "Local storage only",
              "Direct API connections",
              "Full data control"
            ]}
            reverse={true}
          />

          <Feature
            title="⌨️ Keyboard Shortcuts"
            description="Powerful keyboard shortcuts for hands-free operation during interviews."
            features={[
              "Start/stop listening",
              "Get instant answers",
              "Clear transcription",
              "Toggle stealth mode"
            ]}
            reverse={false}
          />

          <Feature
            title="💬 Conversation History"
            description="Review all your Q&A pairs. Navigate through past questions with ease."
            features={[
              "Full history tracking",
              "MongoDB cloud storage",
              "Easy navigation",
              "Session management"
            ]}
            reverse={true}
          />
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-6">Ready to get started?</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
            Start with 10 free tokens. No credit card required.
          </p>
          <Link
            to="/service"
            className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-lg font-bold transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105 transform"
          >
            🚀 Start Free Trial
          </Link>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

interface FeatureProps {
  title: string;
  description: string;
  features: string[];
  reverse: boolean;
}

const Feature: React.FC<FeatureProps> = ({ title, description, features, reverse }) => (
  <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 items-center`}>
    <div className="flex-1">
      <h3 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-4">{title}</h3>
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">{description}</p>
      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-green-500 text-xl flex-shrink-0">✓</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm sm:text-base">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
    <div className="flex-1">
      <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 rounded-2xl p-8 sm:p-12 border border-slate-200 dark:border-slate-700/50">
        <div className="aspect-video bg-slate-100 dark:bg-slate-800/50 rounded-lg flex items-center justify-center text-4xl sm:text-6xl">
          {title.split(' ')[0]}
        </div>
      </div>
    </div>
  </div>
);

export default FeaturesPage;
