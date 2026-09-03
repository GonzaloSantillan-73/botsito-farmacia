import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

// Components
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import ValidationPanel from './components/ValidationPanel';
import ImageModal from './components/ImageModal';

function App() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  
  const [activePrescription, setActivePrescription] = useState(null);
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [prescriptionObraSocial, setPrescriptionObraSocial] = useState('');
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  
  const messagesEndRef = useRef(null);

  // 1. Fetch Initial Data
  useEffect(() => {
    fetchConversations();
  }, []);

  // 2. Fetch Messages and Prescription when conversation changes
  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.id);
      fetchPrescription(activeConversation.id);
    } else {
      setMessages([]);
      setActivePrescription(null);
    }
  }, [activeConversation]);

  // 3. Realtime Subscriptions
  useEffect(() => {
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          if (activeConversation && payload.new.conversation_id === activeConversation.id) {
            if (payload.eventType === 'INSERT') {
              setMessages(prev => {
                // Prevent duplicate if we just sent it
                if (prev.find(m => m.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
              scrollToBottom();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setConversations(prev => {
              const exists = prev.find(c => c.id === payload.new.id);
              if (exists) {
                return prev.map(c => c.id === payload.new.id ? payload.new : c).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
              }
              return [payload.new, ...prev].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
            
            if (activeConversation?.id === payload.new.id) {
              setActiveConversation(payload.new);
            }
          } else if (payload.eventType === 'INSERT') {
            setConversations(prev => [payload.new, ...prev].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prescriptions' },
        (payload) => {
          if (activeConversation && payload.new.conversation_id === activeConversation.id) {
             setActivePrescription(payload.new);
             setPrescriptionNotes(payload.new.notes || '');
             setPrescriptionObraSocial(payload.new.obra_social || '');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversation]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchConversations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
      
    if (!error && data) {
      setConversations(data);
    }
    setLoading(false);
  };

  const fetchMessages = async (convId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setMessages(data);
      scrollToBottom();
    }
  };

  const fetchPrescription = async (convId) => {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('conversation_id', convId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      setActivePrescription(data);
      setPrescriptionNotes(data.notes || '');
      setPrescriptionObraSocial(data.obra_social || '');
    } else {
      setActivePrescription(null);
    }
  };

  const handleSendMessage = async (customText = null, mediaUrl = null, mediaType = 'text') => {
    const textToSend = typeof customText === 'string' ? customText : messageInput;
    if ((!textToSend.trim() && !mediaUrl) || !activeConversation) return;

    const messageId = crypto.randomUUID();
    const inputToSave = textToSend.trim();
    if (typeof customText !== 'string' && !mediaUrl) {
      setMessageInput('');
    }

    // Optimistic UI update
    const tempMessage = {
      id: messageId,
      conversation_id: activeConversation.id,
      sender_type: 'agent',
      message_text: inputToSave,
      media_type: mediaUrl ? (mediaType || 'image') : 'text',
      media_url: mediaUrl,
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempMessage]);
    scrollToBottom();

    const { error } = await supabase
      .from('messages')
      .insert([
        { 
          id: messageId,
          conversation_id: activeConversation.id, 
          sender_type: 'agent', 
          message_text: inputToSave,
          media_type: mediaUrl ? (mediaType || 'image') : 'text',
          media_url: mediaUrl
        }
      ]);

    if (!error) {
      // Dispatch to WhatsApp Node Server
      fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversation.id,
          message_text: inputToSave,
          media_url: mediaUrl,
          media_type: mediaType
        })
      }).catch(err => console.error("Error contactando backend:", err));

      // Update conversation timestamp & last_message
      const previewText = mediaUrl ? `📎 Archivo enviado${inputToSave ? ' - ' + inputToSave : ''}` : inputToSave;
      
      await supabase
        .from('conversations')
        .update({ 
           updated_at: new Date().toISOString(),
           last_message: previewText 
        })
        .eq('id', activeConversation.id);
    }
  };

  const handleUpdateConversationStatus = async (newStatus) => {
    if (!activeConversation) return;
    
    // Optimistic UI update
    setActiveConversation(prev => ({ ...prev, status: newStatus }));
    setConversations(prev => prev.map(c => c.id === activeConversation.id ? { ...c, status: newStatus } : c));

    const { error } = await supabase
      .from('conversations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', activeConversation.id);
      
    if (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleUpdatePrescription = async (newStatus, rejectReason = '') => {
    if (!activePrescription) return;

    const { error } = await supabase
      .from('prescriptions')
      .update({
        status: newStatus,
        obra_social: prescriptionObraSocial,
        notes: prescriptionNotes
      })
      .eq('id', activePrescription.id);

    if (!error) {
       // Update conversation status based on prescription result
       const convStatus = newStatus === 'approved' ? 'open' : 'rejected';
       await supabase
         .from('conversations')
         .update({ status: convStatus, updated_at: new Date().toISOString() })
         .eq('id', activeConversation.id);
         
       // Send an automatic message about the resolution
       let botMessage = '';
       if (newStatus === 'approved') {
         botMessage = '✅ Tu receta médica ha sido validada y aprobada correctamente.';
       } else {
         botMessage = `❌ Receta no aprobada: ${rejectReason}. Por favor envíanos una nueva foto clara.`;
       }

       await supabase.from('messages').insert([{
         conversation_id: activeConversation.id,
         sender_type: 'bot',
         message_text: botMessage,
         media_type: 'text'
       }]);

       // Dispatch bot message to WhatsApp Node Server
       fetch('/api/messages/send', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           conversation_id: activeConversation.id,
           message_text: botMessage
         })
       }).catch(err => console.error("Error contactando backend:", err));
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const now = new Date();
      
      const { data: convs, error: convError } = await supabase.from('conversations').insert([
        { client_name: 'Carlos Gómez', client_phone: '+54 9 11 4455-6677', status: 'pending_validation' },
        { client_name: 'María López', client_phone: '+54 9 11 2233-4455', status: 'open' },
        { client_name: 'Juan Pérez', client_phone: '+54 9 11 9988-7766', status: 'resolved' },
      ]).select();
      
      if (convError || !convs) throw new Error("Error creating conversations");

      const carlos = convs.find(c => c.client_name === 'Carlos Gómez');
      const maria = convs.find(c => c.client_name === 'María López');
      const juan = convs.find(c => c.client_name === 'Juan Pérez');
      
      await supabase.from('messages').insert([
        { conversation_id: carlos.id, sender_type: 'bot', message_text: '¡Hola Carlos! Bienvenido a la farmacia. Por favor envía tu receta.', created_at: new Date(now.getTime() - 15 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Hola, buenas tardes. Necesito cotizar estos medicamentos por OSDE.', created_at: new Date(now.getTime() - 10 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Adjunto la receta', media_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', media_type: 'image', created_at: new Date(now.getTime() - 9 * 60000).toISOString() }
      ]);
      
      await supabase.from('prescriptions').insert([{
        conversation_id: carlos.id,
        image_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800',
        status: 'pending',
        obra_social: 'OSDE 210',
        notes: 'Pendiente verificar token digital'
      }]);
      
      await supabase.from('messages').insert([
         { conversation_id: maria.id, sender_type: 'client', message_text: 'Hola, ¿tienen disponibilidad de alcohol en gel de 500ml y analgésicos de venta libre (Ibuprofeno 400)?', created_at: new Date(now.getTime() - 60 * 60000).toISOString() },
         { conversation_id: maria.id, sender_type: 'agent', message_text: '¡Hola María! Sí, tenemos stock de ambos productos.', created_at: new Date(now.getTime() - 50 * 60000).toISOString() }
      ]);

      await supabase.from('messages').insert([
         { conversation_id: juan.id, sender_type: 'client', message_text: 'Gracias por enviarme el pedido, llegó perfecto.', created_at: new Date(now.getTime() - 24 * 3600000).toISOString() },
         { conversation_id: juan.id, sender_type: 'agent', message_text: '¡De nada Juan! Cualquier otra consulta estamos a tu disposición.', created_at: new Date(now.getTime() - 23 * 3600000).toISOString() }
      ]);
      
      await fetchConversations();
    } catch (e) {
      console.error(e);
      alert('Error al sembrar datos. Asegúrate de haber ejecutado el schema.sql primero.');
    }
    setIsSeeding(false);
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      
      <Sidebar 
        conversations={conversations}
        loading={loading}
        activeConversation={activeConversation}
        setActiveConversation={setActiveConversation}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSeedData={handleSeedData}
        isSeeding={isSeeding}
      />

      <ChatArea 
        activeConversation={activeConversation}
        messages={messages}
        messagesEndRef={messagesEndRef}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        handleSendMessage={handleSendMessage}
        handleUpdateConversationStatus={handleUpdateConversationStatus}
        setModalImage={setModalImage}
      />

      <ValidationPanel 
        activeConversation={activeConversation}
        activePrescription={activePrescription}
        prescriptionObraSocial={prescriptionObraSocial}
        setPrescriptionObraSocial={setPrescriptionObraSocial}
        prescriptionNotes={prescriptionNotes}
        setPrescriptionNotes={setPrescriptionNotes}
        handleUpdatePrescription={handleUpdatePrescription}
        setModalImage={setModalImage}
        handleSendMessage={handleSendMessage}
      />

      {/* Fullscreen Image Modal */}
      {modalImage && (
        <ImageModal 
          imageUrl={modalImage} 
          onClose={() => setModalImage(null)} 
        />
      )}

    </div>
  );
}

export default App;
