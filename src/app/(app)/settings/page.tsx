'use client';

// ============================================
// Settings Page
// User settings: launch date, profile info, etc.
// Extensible for future settings
// ============================================
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings as SettingsIcon, Rocket, User, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  // Load user info
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
      }
    }
    loadUser();

    // Load launch date from localStorage (simple persistence for now)
    const storedLaunchDate = localStorage.getItem('everest_launch_date');
    if (storedLaunchDate) setLaunchDate(storedLaunchDate);
  }, [supabase]);

  function saveLaunchDate() {
    localStorage.setItem('everest_launch_date', launchDate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clearChatHistory() {
    if (!confirm('Are you sure you want to clear all chat history? This cannot be undone.')) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id);

    alert('Chat history cleared.');
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-gray-600" />
          Settings
        </h1>
        <p className="text-gray-500 text-sm">Manage your Everest Calendar preferences.</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Account info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={email} disabled className="bg-gray-50" />
              <p className="text-xs text-gray-400">
                Your email is managed through Supabase authentication.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Launch date */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Launch Date
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="launchDate">Target Launch Date</Label>
              <Input
                id="launchDate"
                type="date"
                value={launchDate}
                onChange={(e) => setLaunchDate(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                This powers the countdown widget on your dashboard.
              </p>
            </div>
            <Button onClick={saveLaunchDate} disabled={!launchDate}>
              {saved ? '✓ Saved!' : 'Save Launch Date'}
            </Button>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Clear Chat History</p>
                <p className="text-xs text-gray-400">
                  Permanently delete all chat messages with the AI assistant.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={clearChatHistory}>
                Clear History
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
