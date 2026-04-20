import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Customer, CustomerCategory, Note, Task } from '../types';
import { Plus, Trash2, Mic, MicOff, Loader2, Calendar as CalendarIcon, CheckSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppContext } from '../data/AppContext';

interface EditCustomerDialogProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (customer: Customer) => void;
}

export const EditCustomerDialog: React.FC<EditCustomerDialogProps> = ({ customer, open, onOpenChange, onSave }) => {
  const { addTask, deleteCustomer, salesReps } = useAppContext();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [salesRepId, setSalesRepId] = useState('');
  const [category, setCategory] = useState<CustomerCategory>('Retail');
  const [monthlySalesVolume, setMonthlySalesVolume] = useState<number | ''>('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [alsoCreateTask, setAlsoCreateTask] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const recognitionRef = useRef<any>(null);
  const salesRepOptions = React.useMemo(() => {
    if (!customer?.salesRepId) return salesReps;
    if (salesReps.some((rep) => rep.id === customer.salesRepId)) return salesReps;
    return [
      {
        id: customer.salesRepId,
        email: customer.salesRepEmail || customer.salesRepName || '',
        displayName: customer.salesRepName || customer.salesRepEmail || 'Assigned rep',
      },
      ...salesReps,
    ];
  }, [salesReps, customer]);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setCompany(customer.company || '');
      setEmail(customer.email || '');
      setPhone(customer.phone || '');
      setSalesRepId(customer.salesRepId || '');
      setCategory(customer.category || 'Retail');
      setMonthlySalesVolume(customer.monthlySalesVolume || '');
      setNotes(customer.notes || []);
      setNewNoteText('');
      setIsConfirmingDelete(false);
    }
  }, [customer]);

  const handleDelete = () => {
    if (isConfirmingDelete && customer) {
      deleteCustomer(customer.id);
      onOpenChange(false);
    } else {
      setIsConfirmingDelete(true);
    }
  };

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    const noteId = `note-${Date.now()}`;
    const dateStr = new Date().toISOString().split('T')[0];
    
    const newNote: Note = {
      id: noteId,
      text: newNoteText.trim(),
      date: dateStr
    };
    
    // Create task if requested
    if (alsoCreateTask && customer) {
      const newTask: Task = {
        id: `t-${Date.now()}`,
        title: newNoteText.trim().split('\n')[0].substring(0, 50),
        description: newNoteText.trim(),
        status: 'To Do',
        customerId: customer.id,
        dueDate: taskDueDate || undefined,
        createdAt: dateStr
      };
      addTask(newTask);
    }
    
    setNotes([newNote, ...notes]);
    setNewNoteText('');
    setAlsoCreateTask(false);
    setTaskDueDate('');
  };

  const handleRemoveNote = (noteId: string) => {
    setNotes(notes.filter(n => n.id !== noteId));
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support voice recording. Please try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setNewNoteText(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        alert("Microphone access was denied. Please allow microphone access in your browser settings to use voice notes. If you are using this app in an iframe, you may need to open it in a new tab.");
      }
    };

    recognition.onend = async () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        await processVoiceNote(finalTranscript);
      }
    };

    recognition.start();
    setIsRecording(true);
    setNewNoteText(''); // Clear input when starting
  };

  const processVoiceNote = async (transcript: string) => {
    setIsProcessingVoice(true);
    try {
      const response = await fetch('/api/gemini/process-voice-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      });

      const data = await response.json();
      if (data.success && data.text) {
        setNewNoteText(data.text);
      } else {
        console.error('Failed to process voice note:', data.error);
        setNewNoteText(transcript); // Fallback to raw transcript
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      setNewNoteText(transcript); // Fallback to raw transcript
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customer) {
      const salesRep = salesReps.find((rep) => rep.id === salesRepId);
      onSave({
        ...customer,
        name,
        company,
        email,
        phone,
        salesRepId,
        salesRepName: salesRep?.displayName || salesRep?.email || 'Assigned rep',
        salesRepEmail: salesRep?.email,
        category,
        monthlySalesVolume: monthlySalesVolume === '' ? undefined : Number(monthlySalesVolume),
        notes
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {customer?.isProspect ? 'Prospect' : 'Customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Contact Name</Label>
              <Input id="edit-name" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-company">Company</Label>
              <Input id="edit-company" required value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Account Rep</Label>
              <Select value={salesRepId} onValueChange={setSalesRepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a rep" />
                </SelectTrigger>
                <SelectContent>
                  {salesRepOptions.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.displayName || rep.email || 'Assigned rep'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v: CustomerCategory) => setCategory(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Retail">Retail</SelectItem>
                  <SelectItem value="Wholesale">Wholesale</SelectItem>
                  <SelectItem value="Distributor">Distributor</SelectItem>
                  <SelectItem value="Partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-sales">Projected Monthly Sales Volume ($)</Label>
              <Input 
                id="edit-sales" 
                type="number" 
                min="0"
                step="0.01"
                placeholder="e.g. 5000"
                value={monthlySalesVolume} 
                onChange={e => setMonthlySalesVolume(e.target.value === '' ? '' : Number(e.target.value))} 
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Notes</Label>
              <Button 
                type="button" 
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={toggleRecording}
                className={isRecording ? "animate-pulse" : ""}
              >
                {isRecording ? (
                  <><MicOff className="w-4 h-4 mr-2" /> Stop Recording</>
                ) : (
                  <><Mic className="w-4 h-4 mr-2" /> Voice Note</>
                )}
              </Button>
            </div>
            
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-3">
                <div className="relative">
                  <textarea 
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Type a note or click 'Voice Note' to speak..." 
                    value={newNoteText} 
                    onChange={e => setNewNoteText(e.target.value)}
                    disabled={isProcessingVoice}
                  />
                  {isProcessingVoice && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-md">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                      <span className="ml-2 text-sm font-medium text-emerald-700">AI is formatting your note...</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 p-2 bg-slate-50 rounded-md border border-dashed border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      checked={alsoCreateTask}
                      onChange={e => setAlsoCreateTask(e.target.checked)}
                    />
                    <span className="text-xs font-medium text-slate-700 group-hover:text-emerald-700 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" />
                      Also create task from this note
                    </span>
                  </label>
                  
                  {alsoCreateTask && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                      <Label htmlFor="task-due-date" className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Due Date:</Label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
                        <Input 
                          id="task-due-date"
                          type="date" 
                          className="h-7 text-[11px] pl-7 w-32 border-slate-200 bg-white"
                          value={taskDueDate}
                          onChange={e => setTaskDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <Button 
                type="button" 
                onClick={handleAddNote} 
                variant="secondary"
                className="h-10 mt-1"
                disabled={!newNoteText.trim() || isProcessingVoice}
              >
                <Plus className="h-4 w-4 mr-2" /> Add
              </Button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {notes.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No notes yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="bg-slate-50 p-3 rounded-md border text-sm relative group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-medium text-slate-500">{note.date}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveNote(note.id)}
                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-slate-700 prose prose-sm max-w-none">
                      <ReactMarkdown>{note.text}</ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-red-600">Are you sure?</span>
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
                  Yes, Delete
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsConfirmingDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
            
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};