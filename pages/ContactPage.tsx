import React, { useState } from 'react';
import Footer from '../components/Footer';

const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, send to backend
    console.log('Form submitted:', formData);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-black dark:text-white mb-4">Get in Touch</h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400">
            Have questions? We'd love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Contact Info */}
          <div className="space-y-6">
            <ContactMethod
              icon="📧"
              title="Email"
              value="support@interviewassist.com"
              link="mailto:support@interviewassist.com"
            />
            <ContactMethod
              icon="💬"
              title="Discord"
              value="Join our community"
              link="#"
            />
            <ContactMethod
              icon="🐙"
              title="GitHub"
              value="View source code"
              link="#"
            />
            <ContactMethod
              icon="🐦"
              title="Twitter"
              value="@InterviewAssist"
              link="#"
            />
          </div>

          {/* Contact Form */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-bold text-black dark:text-white mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-bold text-black dark:text-white mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-bold text-black dark:text-white mb-2">
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">Select a subject</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="feature">Feature Request</option>
                  <option value="bug">Bug Report</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-bold text-black dark:text-white mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={5}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder="Tell us how we can help..."
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Send Message
              </button>

              {submitted && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 text-center">
                  <p className="text-green-600 dark:text-green-400 font-bold">✓ Message sent successfully!</p>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800">
          <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            <FAQItem
              question="What is the response time for support?"
              answer="We typically respond within 24-48 hours. For urgent issues, please use the Discord channel for faster support."
            />
            <FAQItem
              question="Can I request a refund?"
              answer="Yes! We offer a 30-day money-back guarantee for all paid plans. No questions asked."
            />
            <FAQItem
              question="How do I report a bug?"
              answer="Use the contact form above or open an issue on our GitHub repository."
            />
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

interface ContactMethodProps {
  icon: string;
  title: string;
  value: string;
  link: string;
}

const ContactMethod: React.FC<ContactMethodProps> = ({ icon, title, value, link }) => (
  <a
    href={link}
    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-500/50 transition-all group"
  >
    <div className="text-4xl">{icon}</div>
    <div>
      <h3 className="font-bold text-black dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 text-sm">{value}</p>
    </div>
  </a>
);

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => (
  <div className="border-b border-slate-200 dark:border-slate-800 pb-4 last:border-0">
    <h3 className="font-bold text-black dark:text-white mb-2">{question}</h3>
    <p className="text-slate-600 dark:text-slate-400 text-sm">{answer}</p>
  </div>
);

export default ContactPage;
