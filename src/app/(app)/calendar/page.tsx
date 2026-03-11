'use client';

// ============================================
// Calendar Page
// Monthly/weekly calendar with event management
// ============================================
import { useState } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import WeekView from '@/components/calendar/WeekView';
import EventDialog from '@/components/calendar/EventDialog';
import { useEvents } from '@/lib/hooks/useEvents';
import { CalendarEvent, EventFormData } from '@/types';

export default function CalendarPage() {
  const { events, loading, createEvent, updateEvent, deleteEvent } = useEvents();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>('');

  // Navigation handlers
  function goNext() {
    setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  }
  function goPrev() {
    setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  }
  function goToday() {
    setCurrentDate(new Date());
  }

  // Open dialog to create a new event on a specific day
  function handleDayClick(date: Date) {
    setSelectedEvent(null);
    setDefaultDate(format(date, 'yyyy-MM-dd'));
    setDialogOpen(true);
  }

  // Open dialog to edit an existing event
  function handleEventClick(event: CalendarEvent) {
    setSelectedEvent(event);
    setDefaultDate('');
    setDialogOpen(true);
  }

  // Save handler (create or update)
  async function handleSave(data: EventFormData) {
    if (selectedEvent) {
      await updateEvent(selectedEvent.id, data);
    } else {
      await createEvent(data);
    }
  }

  // Delete handler
  async function handleDelete() {
    if (selectedEvent) {
      await deleteEvent(selectedEvent.id);
    }
  }

  return (
    <div>
      {/* Header with navigation and view toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 text-sm">
            {format(currentDate, view === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation */}
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Add event */}
          <Button
            size="sm"
            onClick={() => {
              setSelectedEvent(null);
              setDefaultDate(format(new Date(), 'yyyy-MM-dd'));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Calendar content */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : view === 'month' ? (
        <CalendarGrid
          currentMonth={currentDate}
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      )}

      {/* Event create/edit dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedEvent(null);
        }}
        onSave={handleSave}
        onDelete={selectedEvent ? handleDelete : undefined}
        event={selectedEvent}
        defaultDate={defaultDate}
      />
    </div>
  );
}
