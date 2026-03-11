'use client';

// ============================================
// useEvents Hook
// CRUD operations for calendar events via Supabase
// Includes realtime subscription for live updates
// ============================================
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CalendarEvent, EventFormData } from '@/types';

export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Fetch all events for the current user
  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('event_date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  }, [supabase]);

  // Create a new event — returns true on success, false on failure
  async function createEvent(formData: EventFormData): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from('calendar_events').insert({
      user_id: user.id,
      title: formData.title,
      description: formData.description || null,
      event_date: formData.event_date,
      event_time: formData.event_time || null,
      category: formData.category,
      priority: formData.priority,
      status: formData.status,
      is_big_mover: formData.is_big_mover ?? false,
    });

    if (error) {
      console.error('Error creating event:', error);
      return false;
    }

    await fetchEvents(); // Refresh the list
    return true;
  }

  // Update an existing event
  async function updateEvent(id: string, formData: EventFormData) {
    const { error } = await supabase
      .from('calendar_events')
      .update({
        title: formData.title,
        description: formData.description || null,
        event_date: formData.event_date,
        event_time: formData.event_time || null,
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        is_big_mover: formData.is_big_mover ?? false,
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating event:', error);
    } else {
      await fetchEvents();
    }
  }

  // Delete an event
  async function deleteEvent(id: string) {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting event:', error);
    } else {
      await fetchEvents();
    }
  }

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchEvents();

    // Subscribe to realtime changes on calendar_events
    const channel = supabase
      .channel('calendar_events_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events' },
        () => {
          fetchEvents(); // Re-fetch when any change happens
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents, supabase]);

  return { events, loading, createEvent, updateEvent, deleteEvent, refetch: fetchEvents };
}
